import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { EventType, JsonOfficial } from '../../types'

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

const { eventTypeTable } = CONFIG
const dynamoDB = new CustomDynamoClient()

const refreshOfficials = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const klapi = new KLAPI(getKLAPIConfig)
  const eventTypes = (await dynamoDB.readAll<EventType>(eventTypeTable))?.filter((et) => et.active) || []
  const existingOfficials = (await dynamoDB.readAll<JsonOfficial>()) ?? []
  const write: JsonOfficial[] = []
  for (const eventType of eventTypes) {
    const { status, json } = await klapi.lueKoemuodonKoetoimitsijat({
      Koemuoto: eventType.eventType,
      Kieli: KLKieli.Suomi,
    })
    if (status === 200 && json) {
      for (const item of json) {
        const existing = existingOfficials.find((official) => official.id === item.jäsennumero)
        const name = capitalize(item.nimi)
        const location = capitalize(item.paikkakunta)
        const official: JsonOfficial = {
          languages: [],
          createdAt: new Date().toISOString(),
          createdBy: 'system',
          modifiedAt: new Date().toISOString(),
          modifiedBy: 'system',
          ...existing,
          id: item.jäsennumero,
          name,
          location,
          district: item.kennelpiiri,
          email: item.sähköposti,
          phone: item.puhelin,
          eventTypes: item.koemuodot.map((koemuoto) => koemuoto.lyhenne),
          deletedBy: '',
        }
        if (official.deletedAt) {
          delete official.deletedAt
        }
        if (!existing || Object.keys(diff(existing, official)).length > 0) {
          const mode = existing ? 'updated' : 'new'
          console.log(`${mode} official: ${official.id}: ${official.name}`, { existing, official })
          write.push(official)
          if (existing) {
            Object.assign(existing, official)
          } else {
            existingOfficials.push(official)
          }
        }
      }
    }
    if (write.length) {
      await dynamoDB.batchWrite(write)

      for (const official of write) {
        await getAndUpdateUserByEmail(official.email, {
          name: reverseName(official.name),
          kcId: official.id,
          officer: true,
          location: official.location,
          phone: official.phone,
        })
      }
    }
  }
  const items = existingOfficials.filter((o) => !o.deletedAt)
  return response(200, items, event)
}

const getOfficialsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
          return refreshOfficials(event)
        }
        const items = (await dynamoDB.readAll<JsonOfficial>())?.filter((o) => !o.deletedAt)
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

export default getOfficialsHandler
