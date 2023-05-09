import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import { diff } from 'deep-object-diff'
import { EventType, JsonDbRecord, Judge } from 'koekalenteri-shared/model'

import { authorize, getAndUpdateUserByEmail } from '../../utils/auth'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { genericWriteHandler } from '../../utils/genericHandlers'
import KLAPI from '../../utils/KLAPI'
import { KLKieli } from '../../utils/KLAPI_models'
import { metricsError, metricsSuccess } from '../../utils/metrics'
import { response } from '../../utils/response'
import { getKLAPIConfig } from '../../utils/secrets'
import { capitalize, reverseName } from '../../utils/string'

const dynamoDB = new CustomDynamoClient()
const klapi = new KLAPI(getKLAPIConfig)

export const getJudgesHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }

        if (user.admin && event.queryStringParameters && 'refresh' in event.queryStringParameters) {
          const eventTypeTable = process.env.EVENT_TYPE_TABLE_NAME || ''
          const eventTypes = (await dynamoDB.readAll<EventType>(eventTypeTable))?.filter((et) => et.active) || []
          for (const eventType of eventTypes) {
            const { status, json } = await klapi.lueKoemuodonYlituomarit({
              Koemuoto: eventType.eventType,
              Kieli: KLKieli.Suomi,
            })
            if (status === 200 && json) {
              for (const item of json) {
                const existing = await dynamoDB.read<Judge>({ id: item.jäsennumero })
                const name = capitalize(item.nimi)
                const location = capitalize(item.paikkakunta)
                const judge = {
                  active: true,
                  ...existing,
                  id: item.jäsennumero,
                  name,
                  location,
                  district: item.kennelpiiri,
                  email: item.sähköposti,
                  phone: item.puhelin,
                  eventTypes: item.koemuodot.map((koemuoto) => koemuoto.lyhenne),
                  official: true,
                  deletedAt: false,
                  deletedBy: '',
                }
                if (!existing || Object.keys(diff(existing, judge)).length > 0) {
                  await dynamoDB.write(judge)
                }
                await getAndUpdateUserByEmail(item.sähköposti, {
                  name: reverseName(name),
                  kcId: item.jäsennumero,
                  judge: true,
                  location,
                  phone: item.puhelin,
                })
              }
            }
          }
        }
        const items = (await dynamoDB.readAll<Judge & JsonDbRecord>())?.filter((j) => !j.deletedAt)
        metricsSuccess(metrics, event.requestContext, 'getJudges')
        return response(200, items, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getJudges')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)

export const putJudgeHandler = genericWriteHandler(dynamoDB, 'putJudge')
