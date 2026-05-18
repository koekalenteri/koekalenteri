import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { authorizeWithMemberOf } from '../auth/api'
import { connectWebSocket, publishConnectionCount } from '../ws/broadcastService'

const getExpiryEpochSeconds = (event: APIGatewayEvent) => {
  const exp = event.requestContext.authorizer?.claims?.exp
  const expiresAt = typeof exp === 'string' ? Number.parseInt(exp, 10) : typeof exp === 'number' ? exp : undefined

  return Number.isFinite(expiresAt) ? expiresAt : undefined
}

const wsConnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId!

  const auth = await authorizeWithMemberOf(event as any).catch(() => ({ res: undefined }))

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
  await publishConnectionCount(connectionId)

  return { body: 'Connected', statusCode: 200 }
}

export default wsConnectHandler
