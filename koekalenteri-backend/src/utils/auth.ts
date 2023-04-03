import { APIGatewayProxyEvent } from 'aws-lambda'
import { diff } from 'deep-object-diff'
import { User } from 'koekalenteri-shared/model'
import { nanoid } from 'nanoid'

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

  if (!user && process.env.NODE_ENV !== 'test') {
    throw new Error('Unauthorized user')
  }

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
  const users = (await dynamoDB.readAll<User>(USER_TABLE))?.filter((item) => item.email === email)
  const user = users?.length ? users[0] : { id: nanoid(), email }
  if (Object.keys(diff(user, { ...props, ...user })).length > 0) {
    dynamoDB.write(user, USER_TABLE)
  }
  return user
}

export function getOrigin(event: APIGatewayProxyEvent) {
  return event.headers.origin || event.headers.Origin
}

export function getUsername(event: APIGatewayProxyEvent) {
  console.log('authorizer', event.requestContext.authorizer)
  return event.requestContext.authorizer?.claims['cognito:username'] || 'anonymous'
}
