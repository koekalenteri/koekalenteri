import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'

import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.wsConnectionsTable)

const wsConnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId!

  await dynamoDB.write({ connectionId })

  return { statusCode: 200, body: 'Connected' }
}

export default wsConnectHandler
