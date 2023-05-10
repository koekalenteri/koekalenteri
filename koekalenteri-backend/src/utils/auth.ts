import { APIGatewayProxyEvent } from 'aws-lambda'
import { diff } from 'deep-object-diff'
import { User } from 'koekalenteri-shared/model'
import { nanoid } from 'nanoid'

import { findUserByEmail, updateUser } from '../lib/user'

import CustomDynamoClient from './CustomDynamoClient'

interface UserLink {
  cognitoUser: string
  userId: string
}

const USER_LINK_TABLE = process.env.USER_LINK_TABLE_NAME
const USER_TABLE = process.env.USER_TABLE_NAME

const dynamoDB = new CustomDynamoClient(USER_LINK_TABLE)

export async function authorize(event: APIGatewayProxyEvent) {
  const user = await getOrCreateUser(event)

  return user
}

async function getOrCreateUser(event: APIGatewayProxyEvent) {
  let user

  if (!event.requestContext.authorizer?.claims) {
    return null
  }

  const cognitoUser = event.requestContext.authorizer?.claims.sub
  if (!cognitoUser) {
    return null
  }

  const link = await dynamoDB.read<UserLink>({ cognitoUser }, USER_LINK_TABLE)

  if (link) {
    user = await dynamoDB.read<User>({ id: link.userId }, USER_TABLE)
  } else {
    // no user link forund for the cognitoUser
    const { name, email } = event.requestContext.authorizer.claims

    user = await getAndUpdateUserByEmail(email, { name })
    dynamoDB.write({ cognitoUser, userId: user.id }, USER_LINK_TABLE)
  }
  return user
}

export async function getAndUpdateUserByEmail(email: string, props: Omit<Partial<User>, 'id'>) {
  const user = (await findUserByEmail(email)) ?? { id: nanoid(), email }
  const updated = { name: '?', ...user, ...props }
  if (Object.keys(diff(user, updated)).length > 0) {
    updateUser(updated)
  }
  return updated
}

export function getOrigin(event: APIGatewayProxyEvent) {
  return event.headers.origin || event.headers.Origin
}

export async function getUsername(event: APIGatewayProxyEvent) {
  const user = await getOrCreateUser(event)
  return user?.name ?? 'anonymous'
}
