import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import { nanoid } from 'nanoid'

import 'source-map-support/register'

import { authorize } from './auth'
import CustomDynamoClient from './CustomDynamoClient'
import { metricsError, metricsSuccess } from './metrics'
import { response } from './response'

export function createDbRecord(event: APIGatewayProxyEvent, timestamp: string, username: string) {
  const item = {
    id: nanoid(10),
    ...JSON.parse(event.body || ''),
    createdAt: timestamp,
    createdBy: username,
    modifiedAt: timestamp,
    modifiedBy: username,
  }
  if (!item.id) {
    item.id = nanoid(10)
  }

  return item
}

export const genericWriteHandler = (
  dynamoDB: CustomDynamoClient,
  name: string
): ((event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>) =>
  metricScope((metrics: MetricsLogger) => async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const user = await authorize(event)
    if (!user) {
      return response(401, 'Unauthorized', event)
    }
    const timestamp = new Date().toISOString()

    try {
      const item = createDbRecord(event, timestamp, user.name)
      await dynamoDB.write(item)
      metricsSuccess(metrics, event.requestContext, name)
      return response(200, item, event)
    } catch (err) {
      console.error(err)
      metricsError(metrics, event.requestContext, name)
      return response((err as AWSError).statusCode || 501, err, event)
    }
  })
