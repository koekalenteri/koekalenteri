import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonUser } from '../../types'

import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { findUserByEmail, updateUser } from './user'

interface UserLink {
  cognitoUser: string
  userId: string
}

const { userTable, userLinkTable } = CONFIG

const dynamoDB = new CustomDynamoClient(userLinkTable)

export async function authorize(event?: Partial<APIGatewayProxyEvent>) {
  const user = await getOrCreateUserFromEvent(event)

  return user
}

async function getOrCreateUserFromEvent(event?: Partial<APIGatewayProxyEvent>) {
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
    if (user && !user.name && name) {
      user = await getAndUpdateUserByEmail(email, { name })
    }
  } else {
    // no user link found for the cognitoUser

    user = await getAndUpdateUserByEmail(email, { name })
    await dynamoDB.write({ cognitoUser, userId: user.id }, userLinkTable)
    console.log('added user link', { cognitoUser, userId: user.id })
  }
  return user
}

export async function getAndUpdateUserByEmail(
  rawEmail: string,
  props: Omit<Partial<JsonUser>, 'id' | 'email'>,
  updateName?: boolean,
  modifiedBy: string = 'system'
) {
  const email = rawEmail.toLocaleLowerCase()
  const existing = await findUserByEmail(email)
  const newUser: JsonUser = {
    id: nanoid(10),
    name: '',
    email,
    createdAt: new Date().toISOString(),
    createdBy: modifiedBy,
    modifiedAt: new Date().toISOString(),
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

  const final: JsonUser = { ...newUser, ...existing, ...changes }
  if (Object.keys(diff(existing ?? {}, final)).length > 0) {
    if (existing) console.log('updating user', { existing, final })
    else console.log('creating user', { ...final })
    await updateUser({ ...final, modifiedAt: new Date().toISOString(), modifiedBy })
  }
  return final
}

export function getOrigin(event?: Partial<APIGatewayProxyEvent>) {
  return event?.headers?.origin ?? event?.headers?.Origin ?? ''
}

export async function getUsername(event: Partial<APIGatewayProxyEvent>) {
  const user = await getOrCreateUserFromEvent(event)
  return user?.name ?? 'anonymous'
}
