import type { JsonEventType, JsonUser } from '../../types'
import { diff } from 'deep-object-diff'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import KLAPI from '../lib/KLAPI'
import { lambda, response } from '../lib/lambda'
import { getKLAPIConfig } from '../lib/secrets'
import { KLKieli, KLKieliToLang } from '../types/KLAPI'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTypeTable)

const getEventTypesFromKlapi = async (user: JsonUser) => {
  const klapi = new KLAPI(getKLAPIConfig)

  const timestamp = new Date().toISOString()
  const eventTypes: JsonEventType[] = []

  for (const kieli of [KLKieli.Suomi, KLKieli.Ruotsi, KLKieli.Englanti]) {
    const { status, json, error } = await klapi.lueKoemuodot({ Kieli: kieli })
    if (status !== 200 || !json) {
      console.error('lueKoemuodot', kieli, { error, json, status })
      continue
    }
    for (const item of json) {
      const prev = eventTypes.find((et) => et.eventType === item.lyhenne)
      const eventType: JsonEventType = prev ?? {
        createdAt: timestamp,
        createdBy: user.name,
        description: { en: '', fi: '', sv: '' },
        eventType: item.lyhenne,
        modifiedAt: timestamp,
        modifiedBy: user.name,
        official: true,
      }
      if (!prev) eventTypes.push(eventType)

      eventType.description[KLKieliToLang[kieli]] = item.koemuoto
    }
  }

  return eventTypes
}

const refreshEventTypes = async (user: JsonUser) => {
  const existing = await dynamoDB.readAll<JsonEventType>()
  const eventTypes = await getEventTypesFromKlapi(user)

  const insert = eventTypes.filter((et) => !existing?.find((ex) => ex.eventType === et.eventType))

  if (insert.length) {
    console.log('new eventTypes', insert)
    await dynamoDB.batchWrite(insert)
  }

  const updates = eventTypes.filter((et) => {
    const ex = existing?.find((ex) => ex.eventType === et.eventType)
    return ex && Object.keys(diff(ex.description, et.description)).length > 0
  })

  for (const updated of updates) {
    const ex = existing?.find((ex) => ex.eventType === updated.eventType)
    console.log(`description changed for ${updated.eventType}`, ex?.description, updated.description)
    await dynamoDB.update(
      { eventType: updated.eventType },
      {
        set: {
          description: updated.description,
          modifiedAt: updated.modifiedAt,
          modifiedBy: updated.modifiedBy,
        },
      }
    )
  }
}

const getEventTypesLambda = lambda('getEventTypes', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
    if (!user?.admin) {
      return response(401, 'Unauthorized', event)
    }
    await refreshEventTypes(user)
  }

  const items = await dynamoDB.readAll<JsonEventType>()
  return response(200, items, event)
})

export default getEventTypesLambda
