import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'

import { CONFIG } from '../config'
import { broadcastConnectionCount, wsConnect } from '../lib/broadcast'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.wsConnectionsTable)

const wsConnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId!

  await wsConnect(connectionId)
  await broadcastConnectionCount()

  return { statusCode: 200, body: 'Connected' }
}

export default wsConnectHandler
