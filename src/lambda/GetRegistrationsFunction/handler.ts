import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonRegistration } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { unescape } from 'querystring'

import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { fixRegistrationGroups } from '../lib/event'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.registrationTable)

const getRegistrationsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }

        const eventId = unescape(event.pathParameters?.eventId ?? '')
        const allItems = await dynamoDB.query<JsonRegistration>('eventId = :eventId', {
          ':eventId': eventId,
        })

        // filter out registrations that are pending payment
        const items = allItems?.filter((item) => item.state === 'ready')

        const itemsWithGroups = await fixRegistrationGroups(items ?? [], user)
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
