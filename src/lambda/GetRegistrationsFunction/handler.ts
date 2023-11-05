import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonRegistration } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { fixRegistrationGroups } from '../lib/event'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.registrationTable)

const getRegistrationsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const items = await dynamoDB.query<JsonRegistration>('eventId = :eventId', {
          ':eventId': event.pathParameters?.eventId,
        })
        const itemsWithGroups = await fixRegistrationGroups(items ?? [])
        metricsSuccess(metrics, event.requestContext, 'getRegistrations')
        return response(200, itemsWithGroups, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getRegistrations')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getRegistrationsHandler
