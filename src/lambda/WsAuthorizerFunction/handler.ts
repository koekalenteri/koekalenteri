import { CognitoJwtVerifier } from 'aws-jwt-verify'

type WsAuthEvent = {
  headers?: Record<string, string | undefined>
  queryStringParameters?: Record<string, string | undefined>
  methodArn?: string
  routeArn?: string
}

type JwtPayload = {
  [k: string]: unknown
  sub?: string
  iss?: string
  aud?: string | string[]
  exp?: number
  token_use?: string
}

const deny = (resource: string) => ({
  policyDocument: {
    Statement: [{ Action: 'execute-api:Invoke', Effect: 'Deny', Resource: resource }],
    Version: '2012-10-17',
  },
  principalId: 'anonymous',
})

const allow = (resource: string, claims: JwtPayload) => ({
  context: { claims: JSON.stringify(claims) },
  policyDocument: {
    Statement: [{ Action: 'execute-api:Invoke', Effect: 'Allow', Resource: resource }],
    Version: '2012-10-17',
  },
  principalId: String(claims.sub ?? 'user'),
})

const getToken = (event: WsAuthEvent) => event.queryStringParameters?.token

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined

const getVerifier = () => {
  const userPoolId = process.env.COGNITO_USER_POOL_ID
  const appClientId = process.env.COGNITO_APP_CLIENT_ID
  if (!userPoolId) throw new Error('missing COGNITO_USER_POOL_ID')
  if (!appClientId) throw new Error('missing COGNITO_APP_CLIENT_ID')

  verifier ??= CognitoJwtVerifier.create({
    clientId: appClientId,
    tokenUse: 'id',
    userPoolId,
  })

  return verifier
}

export default async (event: WsAuthEvent) => {
  const resource = event.routeArn ?? event.methodArn ?? '*'
  try {
    const token = getToken(event)
    if (!token) return deny(resource)
    const verifier = getVerifier()
    const payload = (await verifier.verify(token)) as JwtPayload
    return allow(resource, payload)
  } catch (err) {
    console.error('ws authorizer failed', err)
    return deny(resource)
  }
}
