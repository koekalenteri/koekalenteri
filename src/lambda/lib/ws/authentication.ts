import type { APIGatewayEvent } from 'aws-lambda'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { authorizeWithMemberOf } from '../../lib/auth'
import { LambdaError } from '../../lib/lambda'

type JwtPayload = {
  [k: string]: unknown
  aud?: string | string[]
  exp?: number
  iss?: string
  sub?: string
  token_use?: string
}

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined

const getVerifier = () => {
  const userPoolId = process.env.COGNITO_USER_POOL_ID
  const appClientId = process.env.COGNITO_APP_CLIENT_ID
  if (!userPoolId) throw new Error('missing COGNITO_USER_POOL_ID')
  if (!appClientId) throw new Error('missing COGNITO_APP_CLIENT_ID')

  verifier ??= CognitoJwtVerifier.create({ clientId: appClientId, tokenUse: 'id', userPoolId })

  return verifier
}

const getExpiryEpochSeconds = (claims: JwtPayload) => {
  const expiresAt = typeof claims.exp === 'number' ? claims.exp : undefined

  return Number.isFinite(expiresAt) ? expiresAt : undefined
}

const withClaims = (event: APIGatewayEvent, claims: JwtPayload): APIGatewayEvent => ({
  ...event,
  requestContext: {
    ...event.requestContext,
    authorizer: { ...event.requestContext.authorizer, claims: claims as any },
  },
})

export const authenticateWebSocketToken = async (event: APIGatewayEvent, token: string) => {
  const claims = (await getVerifier().verify(token)) as JwtPayload
  const auth = await authorizeWithMemberOf(withClaims(event, claims) as any)

  if (auth.res || !auth.user)
    throw new LambdaError(auth.res?.statusCode ?? 401, String(auth.res?.body ?? 'Unauthorized'))

  return {
    admin: auth.user.admin,
    expiresAt: getExpiryEpochSeconds(claims),
    memberOf: auth.memberOf,
    userEmail: auth.user.email,
    userId: auth.user.id,
    userName: auth.user.name,
  }
}
