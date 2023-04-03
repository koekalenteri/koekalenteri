import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import { Organizer } from 'koekalenteri-shared/model'
import { nanoid } from 'nanoid'

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
