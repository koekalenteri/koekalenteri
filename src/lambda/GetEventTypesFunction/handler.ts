import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonEventType } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import KLAPI from '../lib/KLAPI'
import { getKLAPIConfig } from '../lib/secrets'
import { KLKieli, KLKieliToLang } from '../types/KLAPI'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTypeTable)

const getEventTypesHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          metricsError(metrics, event.requestContext, 'getEventTypes')
          return response(401, 'Unauthorized', event)
        }

        if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
          const klapi = new KLAPI(getKLAPIConfig)
          const insert: JsonEventType[] = []
          const existing = await dynamoDB.readAll<JsonEventType>()
          const timestamp = new Date().toISOString()

          for (const kieli of [KLKieli.Suomi, KLKieli.Ruotsi, KLKieli.Englanti]) {
            const { status, json } = await klapi.lueKoemuodot({ Kieli: kieli })
            if (status === 200 && json) {
              for (const item of json) {
                const old = existing?.find((et) => et.eventType === item.lyhenne)
                if (!old) {
                  const oldInsert = insert.find((et) => et.eventType === item.lyhenne)
                  if (!oldInsert) {
                    insert.push({
                      id: item.lyhenne,
                      createdAt: timestamp,
                      createdBy: user.name,
                      modifiedAt: timestamp,
                      modifiedBy: user.name,
                      eventType: item.lyhenne,
                      description: { fi: '', en: '', sv: '', [KLKieliToLang[kieli]]: item.koemuoto },
                      official: true,
                    })
                  } else {
                    oldInsert.description[KLKieliToLang[kieli]] = item.koemuoto
                  }
                } else if (old?.description[KLKieliToLang[kieli]] !== item.koemuoto) {
                  console.log(
                    `EventType ${old.eventType} description.${KLKieliToLang[kieli]} changed from ${
                      old.description[KLKieliToLang[kieli]]
                    } to ${item.koemuoto}`,
                    old,
                    item
                  )
                  old.description = {
                    ...old.description,
                    [KLKieliToLang[kieli]]: item.koemuoto,
                  }
                  await dynamoDB.update(
                    { eventType: old.eventType },
                    'set #description = :description',
                    {
                      '#description': 'description',
                    },
                    {
                      ':description': old.description,
                    }
                  )
                }
              }
            }
          }
          if (insert.length) {
            await dynamoDB.batchWrite(insert)
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
