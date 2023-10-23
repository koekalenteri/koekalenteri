import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { Organizer } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { authorize } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()

const putOrganizerHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user?.admin) {
          metricsError(metrics, event.requestContext, 'putOrganizer')
          return response(401, 'Unauthorized', event)
        }

        const item: Partial<Organizer> = JSON.parse(event.body || '{}')

        if (!item.id) {
          metricsError(metrics, event.requestContext, 'putOrganizer')
          return response(400, 'no data', event)
        }

        const existing = await dynamoDB.read<Organizer>({ id: item.id })
        const updated = { ...existing, ...item }

        await dynamoDB.write(updated)

        metricsSuccess(metrics, event.requestContext, 'putOrganizer')
        return response(200, updated, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'putOrganizer')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default putOrganizerHandler
