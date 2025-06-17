import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { ServiceException } from '@smithy/smithy-client'

import { CONFIG } from '../config'
import { response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { events } from './demo-events'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const demoEvents = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (CONFIG.stageName !== 'dev' && CONFIG.stackName !== 'local') {
    return response(401, 'Unauthorized', event)
  }

  try {
    await dynamoDB.batchWrite(events)

    return response(200, 'ok', event)
  } catch (err) {
    console.error(err)
    if (err instanceof ServiceException) {
      return response(err.$metadata?.httpStatusCode ?? 501, err.message, event)
    }
    return response(501, err, event)
  }
}

export default demoEvents
