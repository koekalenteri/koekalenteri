import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { EventType } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import KLAPI from '../lib/KLAPI'
import { getKLAPIConfig } from '../lib/secrets'
import { KLKieli, KLKieliToLang } from '../types/KLAPI'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()

const getEventTypesHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
          const klapi = new KLAPI(getKLAPIConfig)
          for (const kieli of [KLKieli.Suomi, KLKieli.Ruotsi, KLKieli.Englanti]) {
            const { status, json } = await klapi.lueKoemuodot({ Kieli: kieli })
            if (status === 200 && json) {
              for (const item of json) {
                const existing = await dynamoDB.read<EventType>({ eventType: item.lyhenne })
                await dynamoDB.write({
                  ...existing,
                  eventType: item.lyhenne,
                  description: {
                    ...existing?.description,
                    [KLKieliToLang[kieli]]: item.koemuoto,
                  },
                  official: true,
                })
              }
            }
          }
        }
        const items = await dynamoDB.readAll()
        metricsSuccess(metrics, event.requestContext, 'getEventTypes')
        return response(200, items, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getEventTypes')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getEventTypesHandler
