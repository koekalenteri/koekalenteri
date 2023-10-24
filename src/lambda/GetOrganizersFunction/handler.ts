import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { Organizer } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { nanoid } from 'nanoid'

import KLAPI from '../lib/KLAPI'
import { getKLAPIConfig } from '../lib/secrets'
import { KLYhdistysRajaus } from '../types/KLAPI'
import { authorize } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()

const refreshOrganizers = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user?.admin) {
          metricsError(metrics, event.requestContext, 'refreshOrganizers')
          return response(401, 'Unauthorized', event)
        }

        const klapi = new KLAPI(getKLAPIConfig)
        const { status, json } = await klapi.lueYhdistykset({ Rajaus: KLYhdistysRajaus.Koejärjestätä })
        if (status === 200 && json) {
          const insert: Organizer[] = []
          const existing = await dynamoDB.readAll<Organizer>()
          for (const item of json) {
            const old = existing?.find((org) => org.kcId === item.jäsennumero)
            if (!old) {
              const org: Organizer = { id: nanoid(10), kcId: item.jäsennumero, name: item.strYhdistys }
              insert.push(org)
            } else if (old.name !== item.strYhdistys) {
              await dynamoDB.update(
                { id: old.id },
                'set #name = :name',
                {
                  '#name': 'name',
                },
                {
                  ':name': item.strYhdistys,
                }
              )
            }
          }
          if (insert.length) {
            dynamoDB.batchWrite(insert)
          }
        }
        const items = await dynamoDB.readAll<Organizer>()

        metricsSuccess(metrics, event.requestContext, 'refreshOrganizers')
        return response(200, items, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'refreshOrganizers')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

const getOrganizersHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
          return refreshOrganizers(event)
        }

        const items = await dynamoDB.readAll<Organizer>()

        metricsSuccess(metrics, event.requestContext, 'getOrganizers')
        return response(200, items, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getOrganizers')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getOrganizersHandler
