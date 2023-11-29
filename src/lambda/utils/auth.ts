import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonUser } from '../../types'

import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { findUserByEmail, updateUser } from '../lib/user'

import CustomDynamoClient from './CustomDynamoClient'

interface UserLink {
  cognitoUser: string
  userId: string
}

const { userTable, userLinkTable } = CONFIG

const dynamoDB = new CustomDynamoClient(userLinkTable)

export async function authorize(event?: Partial<APIGatewayProxyEvent>) {
  const user = await getOrCreateUser(event)

  return user
}

async function getOrCreateUser(event?: Partial<APIGatewayProxyEvent>) {
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

  const link = await dynamoDB.read<UserLink>({ cognitoUser })

  if (link) {
    user = await dynamoDB.read<JsonUser>({ id: link.userId }, userTable)
  } else {
    // no user link forund for the cognitoUser
    const { name, email } = event.requestContext.authorizer.claims

    user = await getAndUpdateUserByEmail(email, { name })
    await dynamoDB.write({ cognitoUser, userId: user.id }, userLinkTable)
    console.log('added user link', { cognitoUser, userId: user.id })
  }
  return user
}

export async function getAndUpdateUserByEmail(rawEmail: string, props: Omit<Partial<JsonUser>, 'id' | 'email'>) {
  const email = rawEmail.toLocaleLowerCase()
  const existing = await findUserByEmail(email)
  const newUser: JsonUser = {
    id: nanoid(10),
    name: '?',
    email,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    modifiedAt: new Date().toISOString(),
    modifiedBy: 'system',
  }

  const changes = { ...props }

  // lets not change a stored name
  if (existing?.name) {
    delete changes.name
  }

  const final: JsonUser = { ...newUser, ...existing, ...changes }
  if (Object.keys(diff(existing ?? {}, final)).length > 0) {
    if (existing) console.log('updating user', { existing, final })
    else console.log('creating user', { ...final })
    await updateUser({ ...final, modifiedAt: new Date().toISOString(), modifiedBy: 'system' })
  }
  return final
}

export function getOrigin(event?: Partial<APIGatewayProxyEvent>) {
  return event?.headers?.origin ?? event?.headers?.Origin ?? ''
}

export async function getUsername(event: Partial<APIGatewayProxyEvent>) {
  const user = await getOrCreateUser(event)
  return user?.name ?? 'anonymous'
}
