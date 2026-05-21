import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { authorizeWithMemberOf } from '../lib/auth'
import { publishConnectionCount } from '../lib/ws/actions'
import { connectWebSocket } from '../lib/ws/connectionLifecycle'

const getExpiryEpochSeconds = (event: APIGatewayEvent) => {
  const exp = event.requestContext.authorizer?.claims?.exp
  const expiresAt = typeof exp === 'string' ? Number.parseInt(exp, 10) : typeof exp === 'number' ? exp : undefined

  return Number.isFinite(expiresAt) ? expiresAt : undefined
}

const wsConnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId!
  const hasAuthToken = !!event.queryStringParameters?.token

  const auth = await authorizeWithMemberOf(event as any).catch((err) => {
    console.error('ws connect auth failed', { connectionId, message: err instanceof Error ? err.message : String(err) })
    return { res: { body: 'Unauthorized', statusCode: 401 } }
  })

  if (auth?.res && hasAuthToken) {
    return auth.res
  }

  const user = auth && 'user' in auth ? auth.user : undefined
  const memberOf = auth && 'memberOf' in auth ? auth.memberOf : undefined
  const canReceiveAdmin = !!user && (user.admin || !!memberOf?.length) && !auth.res
  const expiresAt = getExpiryEpochSeconds(event)

  await connectWebSocket({
    admin: canReceiveAdmin ? user.admin : undefined,
    connectionId,
    expiresAt,
    memberOf: canReceiveAdmin ? memberOf : undefined,
    userId: user?.id,
  })
  await publishConnectionCount()

  return { body: 'Connected', statusCode: 200 }
}

export default wsConnectHandler
