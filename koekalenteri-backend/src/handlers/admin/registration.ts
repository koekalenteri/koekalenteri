import { metricScope, MetricsLogger } from "aws-embedded-metrics"
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda"
import { AWSError } from "aws-sdk"
import { JsonRegistration } from "koekalenteri-shared/model"

import CustomDynamoClient from "../../utils/CustomDynamoClient"
import { metricsError, metricsSuccess } from "../../utils/metrics"
import { response } from "../../utils/response"

export const dynamoDB = new CustomDynamoClient()

export const getRegistrationsHandler = metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const items = await dynamoDB.query<JsonRegistration>('eventId = :eventId', { ':eventId': event.pathParameters?.eventId })
      metricsSuccess(metrics, event.requestContext, 'getRegistrations')
      return response(200, items)
    } catch (err: unknown) {
      metricsError(metrics, event.requestContext, 'getRegistrations')
      return response((err as AWSError).statusCode || 501, err)
    }
  },
)

export const putRegistrationGroupHandler = metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {

    console.log(event.headers)
    console.log(event.requestContext)

    try {
      const registration: JsonRegistration = JSON.parse(event.body || "")
      const key = { eventId: registration.eventId, id: registration.id }

      if (!registration.group) {
        throw new Error('no group for registration')
      }

      await dynamoDB.update(key,
        'set #grp = :value',
        {
          '#grp': 'group',
        },
        {
          ':value': {...registration.group}, // https://stackoverflow.com/questions/37006008/typescript-index-signature-is-missing-in-type
        },
      )

      metricsSuccess(metrics, event.requestContext, 'putRegistrationGroup')
      return response(200, registration)
    } catch (err) {
      console.error(err)
      if (err instanceof Error) {
        console.error(err.message)
      }
      metricsError(metrics, event.requestContext, 'putRegistrationGroup')
      return response((err as AWSError).statusCode || 501, err)
    }
  },
)
