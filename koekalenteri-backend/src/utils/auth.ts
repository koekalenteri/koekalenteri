import { APIGatewayProxyEvent } from 'aws-lambda'
import { User } from 'koekalenteri-shared/model'
import { nanoid } from 'nanoid'

import CustomDynamoClient from './CustomDynamoClient'

const dynamoDB = new CustomDynamoClient('user-link-table')

export async function authorize(event: APIGatewayProxyEvent) {
  const user = await getOrCreateUser(event)

  if (!user) {
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
    user = await dynamoDB.read<User>({ id: link.userId }, 'user-table')
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
      dynamoDB.write(user, 'user-table')
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
