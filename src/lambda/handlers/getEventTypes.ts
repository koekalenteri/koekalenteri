import type { JsonEventType, JsonUser } from '../../types'

import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import KLAPI from '../lib/KLAPI'
import { lambda } from '../lib/lambda'
import { getKLAPIConfig } from '../lib/secrets'
import { KLKieli, KLKieliToLang } from '../types/KLAPI'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTypeTable)

const refreshEventTypes = async (user: JsonUser) => {
  const klapi = new KLAPI(getKLAPIConfig)
  const insert: JsonEventType[] = []
  const existing = await dynamoDB.readAll<JsonEventType>()
  const timestamp = new Date().toISOString()

  for (const kieli of [KLKieli.Suomi, KLKieli.Ruotsi, KLKieli.Englanti]) {
    const { status, json, error } = await klapi.lueKoemuodot({ Kieli: kieli })
    if (status !== 200 || !json) {
      console.error('lueKoemuodot', kieli, { status, error, json })
      continue
    }
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
  if (insert.length) {
    await dynamoDB.batchWrite(insert)
  }
}

const getEventTypesLambda = lambda('getEventTypes', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
    await refreshEventTypes(user)
  }

  const items = await dynamoDB.readAll<JsonEventType>()
  return response(200, items, event)
})

export default getEventTypesLambda
