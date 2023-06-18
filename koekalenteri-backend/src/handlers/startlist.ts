import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import { JsonPublicRegistration, JsonRegistration, JsonRegistrationWithGroup } from 'koekalenteri-shared/model'

import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()

export const getStartListHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const items = await dynamoDB.query<JsonRegistration>('eventId = :eventId', {
          ':eventId': event.pathParameters?.eventId,
        })

        const publicRegs =
          items
            ?.filter<JsonRegistrationWithGroup>((reg): reg is JsonRegistrationWithGroup => !!reg.group)
            .filter((reg) => reg.group.date)
            .map<JsonPublicRegistration>((reg) => ({
              dog: reg.dog,
              group: reg.group,
              handler: reg.handler?.name,
              owner: reg.owner?.name,
              ownerHandles: reg.ownerHandles,
            })) ?? []

        metricsSuccess(metrics, event.requestContext, 'getStartList')
        return response(200, publicRegs, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getStartList')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)
