import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonUser } from '../../types'

import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { appendEmailHistory } from './emailHistory'
import { findUserByEmail, updateUser, userIsMemberOf } from './user'

export interface UserLink {
  cognitoUser: string
  userId: string
}

const { userTable, userLinkTable } = CONFIG

const dynamoDB = new CustomDynamoClient(userLinkTable)

export async function authorize(event?: Partial<APIGatewayProxyEvent>, updateLastSeen?: boolean) {
  const user = await getOrCreateUserFromEvent(event, updateLastSeen)

  return user
}

async function getOrCreateUserFromEvent(event?: Partial<APIGatewayProxyEvent>, updateLastSeen?: boolean) {
  let user: JsonUser | undefined

  if (!event?.requestContext?.authorizer?.claims) {
    console.log('no authorizer in requestContext', event?.requestContext)
    return null
  }

  const cognitoUser = event.requestContext.authorizer?.claims.sub
  if (!cognitoUser) {
    console.log('no claims.sub in requestContext.autorizer', event.requestContext.authorizer)
    return null
  }

  console.log('claims', event.requestContext.authorizer.claims)

  const link = await dynamoDB.read<UserLink>({ cognitoUser })
  const { name, email } = event.requestContext.authorizer.claims

  if (link) {
    user = await dynamoDB.read<JsonUser>({ id: link.userId }, userTable)
    if (user) {
      user = await getAndUpdateUserByEmail(email, { name }, false, updateLastSeen)
    }
  } else {
    // no user link found for the cognitoUser

    // Mitigation for email changes (e.g. user changes email in KL while staying logged in):
    // If a user record already exists by email, link this cognito user to that record instead
    // of creating a new user (or failing later due to mismatched identities).
    const normalizedEmail = typeof email === 'string' ? email.toLocaleLowerCase().trim() : ''
    const existingByEmail = await findUserByEmail(normalizedEmail)

    if (existingByEmail) {
      console.warn('no user link found; linking cognito user to existing user by email', {
        cognitoUser,
        userId: existingByEmail.id,
        email: normalizedEmail,
      })

      // Update lastSeen/name on the existing user record.
      user = await getAndUpdateUserByEmail(normalizedEmail, { name }, false, updateLastSeen)
      await dynamoDB.write({ cognitoUser, userId: existingByEmail.id }, userLinkTable)
      console.log('added user link', { cognitoUser, userId: existingByEmail.id })
    } else {
      user = await getAndUpdateUserByEmail(email, { name }, false, updateLastSeen)
      await dynamoDB.write({ cognitoUser, userId: user.id }, userLinkTable)
      console.log('added user link', { cognitoUser, userId: user.id })
    }
  }
  return user
}

export async function getAndUpdateUserByEmail(
  rawEmail: string,
  props: Omit<Partial<JsonUser>, 'id' | 'email'>,
  updateName?: boolean,
  updateLastSeen?: boolean
) {
  const modifiedBy = 'system'
  const dateString = new Date().toISOString()
  const email = rawEmail.toLocaleLowerCase().trim()
  const existing = await findUserByEmail(email)

  if (existing && existing.email !== email) {
    console.warn('getAndUpdateUserByEmail: existing user email differs from claims email', {
      userId: existing.id,
      existingEmail: existing.email,
      claimsEmail: email,
    })
  }
  const newUser: JsonUser = {
    id: nanoid(10),
    name: '',
    email,
    createdAt: dateString,
    createdBy: modifiedBy,
    modifiedAt: dateString,
    modifiedBy,
  }

  const changes = { ...props }

  // lets not change a stored name or use a non-string value as name
  if ('name' in changes && ((existing?.name && !updateName) || typeof changes.name !== 'string')) {
    delete changes.name
  }
  // if for some reason we have a non-string name in database, replace it
  if (existing && 'name' in existing && typeof existing.name !== 'string') {
    existing.name = changes.name ?? ''
  }

  const final: JsonUser = {
    ...newUser,
    ...existing,
    ...changes,
    // Ensure the canonical email from claims always wins over any stored value.
    email,
    ...(existing?.email && existing.email !== email
      ? { emailHistory: appendEmailHistory(existing, existing.email, email, dateString, 'login') }
      : {}),
    ...(updateLastSeen ? { lastSeen: dateString } : {}),
  }
  if (Object.keys(diff(existing ?? {}, final)).length > 0) {
    if (existing) console.log('updating user', { existing, final })
    else console.log('creating user', { ...final })
    await updateUser({ ...final, modifiedAt: dateString, modifiedBy })
  }
  return final
}

export async function getUsername(event: Partial<APIGatewayProxyEvent>) {
  const user = await getOrCreateUserFromEvent(event)
  return user?.name ?? 'anonymous'
}

export const authorizeWithMemberOf = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user) {
    return { res: response(401, 'Unauthorized', event) }
  }

  const memberOf = userIsMemberOf(user)
  if (!memberOf.length && !user?.admin) {
    console.error(`User ${user.id} is not admin or member of any organizations.`)
    return { user, res: response(403, 'Forbidden', event) }
  }

  console.log(`User ${user.id} is member of ['${memberOf.join("', '")}'].`)

  return { user, memberOf }
}
