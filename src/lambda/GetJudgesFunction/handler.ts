import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { EventType, JsonDbRecord, JsonJudge, Judge } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { diff } from 'deep-object-diff'

import { CONFIG } from '../config'
import KLAPI from '../lib/KLAPI'
import { getKLAPIConfig } from '../lib/secrets'
import { KLKieli } from '../types/KLAPI'
import { authorize, getAndUpdateUserByEmail } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'
import { capitalize, reverseName } from '../utils/string'

const dynamoDB = new CustomDynamoClient()

const { eventTypeTable } = CONFIG

const refreshJudges = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const klapi = new KLAPI(getKLAPIConfig)
  const eventTypes = (await dynamoDB.readAll<EventType>(eventTypeTable))?.filter((et) => et.active) || []
  for (const eventType of eventTypes) {
    const { status, json } = await klapi.lueKoemuodonYlituomarit({
      Koemuoto: eventType.eventType,
      Kieli: KLKieli.Suomi,
    })
    if (status === 200 && json) {
      const existingJudges = await dynamoDB.readAll<JsonJudge>()
      const write: JsonJudge[] = []
      for (const item of json) {
        const existing = existingJudges?.find((j) => j.id === `${item.jäsennumero}`)
        const name = capitalize(item.nimi)
        const location = capitalize(item.paikkakunta)
        const judge: JsonJudge = {
          active: true,
          languages: [],
          createdAt: new Date().toISOString(),
          createdBy: 'system',
          modifiedAt: new Date().toISOString(),
          modifiedBy: 'system',
          ...existing,
          id: `${item.jäsennumero}`,
          name,
          location,
          district: item.kennelpiiri,
          email: item.sähköposti,
          phone: item.puhelin,
          eventTypes: item.koemuodot.map((koemuoto) => koemuoto.lyhenne),
          official: true,
          deletedBy: '',
        }
        if (judge.deletedAt) {
          delete judge.deletedAt
        }
        if (!existing || Object.keys(diff(existing, judge)).length > 0) {
          const mode = existing ? 'updated' : 'new'
          console.log(`${mode} judge: ${judge.id}: ${judge.name}`, { existing, judge })
          write.push(judge)
        }
        await getAndUpdateUserByEmail(item.sähköposti, {
          name: reverseName(name),
          kcId: item.jäsennumero,
          judge: true,
          location,
          phone: item.puhelin,
        })
      }
      if (write.length) {
        await dynamoDB.batchWrite(write)
      }
    }
  }

  const items = (await dynamoDB.readAll<Judge & JsonDbRecord>())?.filter((j) => !j.deletedAt)
  return response(200, items, event)
}

const getJudgesHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
          return refreshJudges(event)
        }
        const items = (await dynamoDB.readAll<Judge & JsonDbRecord>())?.filter((j) => !j.deletedAt)
        metricsSuccess(metrics, event.requestContext, 'getJudges')
        return response(200, items, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getJudges')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getJudgesHandler
