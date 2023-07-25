import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { metricScope } from 'aws-embedded-metrics'

import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

import { refreshOrganizers } from './admin/organizer'

const dynamoDB = new CustomDynamoClient()

export const getOrganizersHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
          return refreshOrganizers(event)
        }

        const items = await dynamoDB.readAll()
        metricsSuccess(metrics, event.requestContext, 'getOrganizers')
        return response(200, items, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getOrganizers')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)
