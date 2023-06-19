import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import {
  JsonEvent,
  JsonPublicRegistration,
  JsonRegistration,
  JsonRegistrationWithGroup,
} from 'koekalenteri-shared/model'

import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()

export const getStartListHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const eventId = event.pathParameters?.eventId
        const confirmedEvent = await dynamoDB.read<JsonEvent>({ id: eventId })
        let publicRegs: JsonPublicRegistration[] = []

        if (['invited', 'started', 'ended', 'completed'].includes(confirmedEvent?.state ?? '')) {
          const items = await dynamoDB.query<JsonRegistration>('eventId = :eventId', {
            ':eventId': eventId,
          })

          publicRegs =
            items
              ?.filter<JsonRegistrationWithGroup>((reg): reg is JsonRegistrationWithGroup => !!reg.group)
              .filter((reg) => reg.group.date)
              .map<JsonPublicRegistration>((reg) => ({
                class: reg.class,
                dog: reg.dog,
                group: reg.group,
                handler: reg.handler?.name,
                owner: reg.owner?.name,
                breeder: reg.breeder?.name,
                ownerHandles: reg.ownerHandles,
              }))
              .sort((a, b) => a.group.number - b.group.number) ?? []
        }

        metricsSuccess(metrics, event.requestContext, 'getStartList')
        return response(publicRegs.length > 0 ? 200 : 404, publicRegs, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getStartList')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)