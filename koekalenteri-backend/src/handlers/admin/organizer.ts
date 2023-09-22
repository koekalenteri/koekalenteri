import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { Organizer } from 'koekalenteri-shared/model'

import { metricScope } from 'aws-embedded-metrics'
import { nanoid } from 'nanoid'

import { authorize } from '../../utils/auth'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import KLAPI from '../../utils/KLAPI'
import { KLYhdistysRajaus } from '../../utils/KLAPI_models'
import { metricsError, metricsSuccess } from '../../utils/metrics'
import { response } from '../../utils/response'
import { getKLAPIConfig } from '../../utils/secrets'

const dynamoDB = new CustomDynamoClient()
const klapi = new KLAPI(getKLAPIConfig)

export const getOrganizersHandler = metricScope(
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
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)

export const refreshOrganizers = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user?.admin) {
          metricsError(metrics, event.requestContext, 'refreshOrganizers')
          return response(401, 'Unauthorized', event)
        }

        const { status, json } = await klapi.lueYhdistykset({ Rajaus: KLYhdistysRajaus.Koejärjestätä })
        if (status === 200 && json) {
          const existing = await dynamoDB.readAll<Organizer>()
          for (const item of json) {
            const old = existing?.find((org) => org.kcId === item.jäsennumero)
            if (!old) {
              const org: Organizer = { id: nanoid(10), kcId: item.jäsennumero, name: item.strYhdistys }
              await dynamoDB.write(org)
            } else {
              if (old.name !== item.strYhdistys) {
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
          }
        }
        const items = await dynamoDB.readAll<Organizer>()

        metricsSuccess(metrics, event.requestContext, 'refreshOrganizers')
        return response(200, items, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'refreshOrganizers')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)

export const putOrganizerHandler = metricScope(
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
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)
