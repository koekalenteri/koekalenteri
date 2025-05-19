import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonUser } from '../../types'

import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { findUserByEmail, updateUser, userIsMemberOf } from './user'

interface UserLink {
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

  if (process.env.AWS_SAM_LOCAL) {
    return getAndUpdateUserByEmail('developer@example.com', { name: 'Developer', admin: true }, updateLastSeen)
  }

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

    user = await getAndUpdateUserByEmail(email, { name }, false, updateLastSeen)
    await dynamoDB.write({ cognitoUser, userId: user.id }, userLinkTable)
    console.log('added user link', { cognitoUser, userId: user.id })
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
