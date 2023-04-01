import { APIGatewayProxyEvent } from 'aws-lambda'
import { User } from 'koekalenteri-shared/model'
import { nanoid } from 'nanoid'

import CustomDynamoClient from './CustomDynamoClient'

const dynamoDB = new CustomDynamoClient('user-link-table')

export async function authorize(event: APIGatewayProxyEvent) {
  // TODO: remove unauthorized access
  console.log('request context', event.requestContext)

  const origin = getOrigin(event)
  const authorized =
    event.requestContext.authorizer !== null ||
    origin === 'https://dev.koekalenteri.snj.fi' ||
    origin === 'http://localhost:3000'

  if (!authorized || event.body === null) {
    throw new Error('Unauthorized user')
  }

  const user = await getOrCreateUser(event)

  return user
}
/**
authorizer: {
    claims: {
      at_hash: 'yukhzt3osvuDUY-OJ2esSw',
      sub: '6f5c1da8-65ea-41c0-8d76-55b0a8ba560e',
      'cognito:groups': 'eu-north-1_I8Llycy4j_Google,admin',
      email_verified: 'true',
      iss: 'https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_I8Llycy4j',
      'cognito:username': 'Google_103286845913839916842',
      origin_jti: '04dc0b8d-b5eb-4b83-af6b-9dd558de0a79',
      'cognito:roles': 'arn:aws:iam::292117731407:role/dev-koesihteeri',
      aud: 'rs7gu0ro5i6585gfi7harqknc',
      identities: '{"dateCreated":"1645200683155","userId":"103286845913839916842","providerName":"Google","providerType":"Google","issuer":null,"primary":"true"}',
      token_use: 'id',
      auth_time: '1678825842',
      name: 'Jukka Kurkela',
      exp: 'Fri Mar 31 07:26:42 UTC 2023',
      iat: 'Fri Mar 31 06:26:42 UTC 2023',
      jti: '80d17052-d30f-4a0f-985d-3f43cc8ad483',
      email: 'jukka.kurkela@gmail.com'
    }
  },
 */
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
