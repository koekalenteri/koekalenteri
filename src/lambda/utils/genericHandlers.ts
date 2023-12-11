import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonDbRecord } from '../../types'
import type CustomDynamoClient from './CustomDynamoClient'

import { metricScope } from 'aws-embedded-metrics'
import { nanoid } from 'nanoid'

import 'source-map-support/register'

import { parseJSONWithFallback } from '../lib/json'

import { authorize } from './auth'
import { metricsError, metricsSuccess } from './metrics'
import { response } from './response'

export function createDbRecord<T extends JsonDbRecord>(
  event: APIGatewayProxyEvent,
  timestamp: string,
  username: string
): T {
  const item: T = {
    // @ts-expect-error 'id' is specified more than once, so this usage will be overwritten.
    id: nanoid(10),
    ...parseJSONWithFallback(event.body),
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
      return response((err as AWSError).statusCode ?? 501, err, event)
    }
  })
