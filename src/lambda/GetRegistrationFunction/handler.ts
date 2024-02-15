import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonDogEvent, JsonRegistration } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { unescape } from 'querystring'

import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.registrationTable)

const getRegistrationHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const eventId = unescape(event.pathParameters?.eventId ?? '')
        const id = unescape(event.pathParameters?.id ?? '')
        if (!eventId || !id) {
          metricsError(metrics, event.requestContext, 'getRegistration')
          return response(404, 'not found', event)
        }
        const item = await dynamoDB.read<JsonRegistration>({
          eventId,
          id,
        })
        if (item) {
          // Make sure not to leak group information to user
          delete item.group

          const dogEvent = await dynamoDB.read<JsonDogEvent>({ id: eventId }, CONFIG.eventTable)
          item.invitationAttachment = dogEvent?.invitationAttachment
        }
        metricsSuccess(metrics, event.requestContext, 'getRegistration')
        return response(200, item, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getRegistration')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getRegistrationHandler
