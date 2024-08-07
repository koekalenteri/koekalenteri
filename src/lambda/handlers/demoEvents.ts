import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { response } from '../utils/response'

import { events } from './demo-events'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const demoEvents = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (process.env.STAGE_NAME !== 'dev') {
    return response(401, 'Unauthorized', event)
  }

  try {
    await dynamoDB.batchWrite(events)

    return response(200, 'ok', event)
  } catch (err) {
    console.error(err)
    return response((err as AWSError).statusCode ?? 501, err, event)
  }
}

export default demoEvents
