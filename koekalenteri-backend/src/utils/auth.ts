import { APIGatewayProxyEvent } from 'aws-lambda'
import { User } from 'koekalenteri-shared/model'
import { nanoid } from 'nanoid'

import CustomDynamoClient from './CustomDynamoClient'

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

  const link = await dynamoDB.read<{ cognitoUser: string; userId: string }>({ cognitoUser })

  if (link) {
    user = await dynamoDB.read<User>({ id: link.userId }, USER_TABLE)
  } else {
    const { name, email } = event.requestContext.authorizer.claims

    const users = await dynamoDB.query<User>('email = :email', {
      ':email': email,
    })
    if (users?.length) {
      // link to existing user
      user = users[0]
    } else {
      // create new user
      user = { id: nanoid(), name, email }
      dynamoDB.write(user, USER_TABLE)
    }
    dynamoDB.write({ cognitoUser, userId: user.id })
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
