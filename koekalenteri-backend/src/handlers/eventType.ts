import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { EventType, JsonDbRecord, Judge, Official } from 'koekalenteri-shared/model'

import { metricScope } from 'aws-embedded-metrics'

import KLAPI from '../lib/KLAPI'
import { getKLAPIConfig } from '../lib/secrets'
import { KLKieli, KLKieliToLang } from '../types/KLAPI'
import { authorize } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { createDbRecord } from '../utils/genericHandlers'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()

export const getEventTypesHandler = metricScope(
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
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)

export const putEventTypeHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const user = await authorize(event)
      if (!user?.admin) {
        return response(401, 'Unauthorized', event)
      }

      const timestamp = new Date().toISOString()

      try {
        const item = createDbRecord(event, timestamp, user.name)
        await dynamoDB.write(item)
        if (!item.active) {
          const active = (await dynamoDB.readAll<EventType>())?.filter((et) => et.active) || []

          const judgeTable = process.env.JUDGE_TABLE_NAME
          const judgesToRemove =
            (await dynamoDB.readAll<Judge & JsonDbRecord>(judgeTable))?.filter(
              (j) => !j.deletedAt && !active.some((et) => j.eventTypes?.includes(et.eventType))
            ) || []
          for (const judge of judgesToRemove) {
            await dynamoDB.write(
              {
                ...judge,
                deletedAt: timestamp,
                deletedBy: user.name,
              },
              judgeTable
            )
          }

          const officialTable = process.env.OFFICIAL_TABLE_NAME
          const officialsToRemove =
            (await dynamoDB.readAll<Official & JsonDbRecord>(officialTable))?.filter(
              (o) => !o.deletedAt && !active.some((et) => o.eventTypes?.includes(et.eventType))
            ) || []
          for (const official of officialsToRemove) {
            await dynamoDB.write(
              {
                ...official,
                deletedAt: timestamp,
                deletedBy: user.name,
              },
              officialTable
            )
          }
        }
        metricsSuccess(metrics, event.requestContext, 'putEventType')
        return response(200, item, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'putEventType')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)
