import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'

import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.wsConnectionsTable)

const wsDisconnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId!

  await dynamoDB.delete({ connectionId })

  return { statusCode: 200, body: 'Disonnected' }
}

export default wsDisconnectHandler
