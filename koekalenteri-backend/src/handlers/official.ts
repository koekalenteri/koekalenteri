import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonDbRecord, Official } from 'koekalenteri-shared/model'

import { metricScope } from 'aws-embedded-metrics'

import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

import { refreshOfficials } from './admin/official'

const dynamoDB = new CustomDynamoClient()

export const getOfficialsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
          return refreshOfficials(event)
        }
        const items = (await dynamoDB.readAll<Official & JsonDbRecord>())?.filter((o) => !o.deletedAt)
        metricsSuccess(metrics, event.requestContext, 'getOfficials')
        return response(200, items, event)
      } catch (err) {
        console.error(err)
        if (err instanceof Error) {
          console.error(err.message)
        }
        metricsError(metrics, event.requestContext, 'getOfficials')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)
