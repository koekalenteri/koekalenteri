import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { EventType, JsonOfficial } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { diff } from 'deep-object-diff'

import { CONFIG } from '../config'
import { authorize, getAndUpdateUserByEmail } from '../lib/auth'
import KLAPI from '../lib/KLAPI'
import { getKLAPIConfig } from '../lib/secrets'
import { capitalize, reverseName } from '../lib/string'
import { KLKieli } from '../types/KLAPI'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const { eventTypeTable, officialTable } = CONFIG
export const dynamoDB = new CustomDynamoClient(officialTable)

const refreshOfficials = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const klapi = new KLAPI(getKLAPIConfig)
  const eventTypes = (await dynamoDB.readAll<EventType>(eventTypeTable))?.filter((et) => et.official && et.active) || []
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
        } else {
          // Make sure user info is up to date
          await getAndUpdateUserByEmail(
            official.email,
            {
              name: reverseName(official.name),
              kcId: official.id,
              officer: official.eventTypes,
              location: official.location,
              phone: official.phone,
            },
            true
          )
        }
      }
    }
    if (write.length) {
      await dynamoDB.batchWrite(write)

      for (const official of write) {
        await getAndUpdateUserByEmail(
          official.email,
          {
            name: reverseName(official.name),
            kcId: official.id,
            officer: official.eventTypes,
            location: official.location,
            phone: official.phone,
          },
          true
        )
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
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
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
