import type { JsonEventType, JsonUser } from '../../types'
import { objectsDiffer } from '../../lib/diff'
import { authorize } from '../lib/auth'
import { collectionChangesSince, parseDateParam } from '../lib/incremental'
import KLAPI from '../lib/KLAPI'
import { httpError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { readEventTypes, updateEventTypeDescription, writeEventTypes } from '../lib/repositories/eventTypeRepository'
import { getKLAPIConfig } from '../lib/secrets'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import { KLKieli, KLKieliToLang } from '../types/KLAPI'

const getEventTypesFromKlapi = async (user: JsonUser) => {
  const klapi = new KLAPI(getKLAPIConfig)

  const timestamp = new Date().toISOString()
  const eventTypes: JsonEventType[] = []

  for (const kieli of [KLKieli.Suomi, KLKieli.Ruotsi, KLKieli.Englanti]) {
    const { status, json, error } = await klapi.lueKoemuodot({ Kieli: kieli })
    if (status !== 200 || !json) {
      logger.error('lueKoemuodot failed', { error, language: kieli, status })
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
  const existing = await readEventTypes()
  const eventTypes = await getEventTypesFromKlapi(user)

  const insert = eventTypes.filter((et) => !existing.find((ex) => ex.eventType === et.eventType))

  if (insert.length) {
    logger.info('new event types', { eventTypes: insert.map((et) => et.eventType) })
    await writeEventTypes(insert)
  }

  const updates = eventTypes.filter((et) => {
    const ex = existing.find((ex) => ex.eventType === et.eventType)
    return ex && objectsDiffer(ex.description, et.description)
  })

  // Distinct keys, a handful of rows: the updates do not depend on each other.
  await Promise.all(
    updates.map((updated) => {
      const ex = existing.find((ex) => ex.eventType === updated.eventType)
      logger.info('event type description changed', {
        description: updated.description,
        eventType: updated.eventType,
        previous: ex?.description,
      })
      return updateEventTypeDescription(updated.eventType, updated)
    })
  )
}

const getEventTypesLambda = lambda('getEventTypes', async (event) => {
  const user = await authorize(event)
  if (!user) {
    throw httpError(401, 'Unauthorized')
  }

  if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
    if (!user?.admin) {
      throw httpError(401, 'Unauthorized')
    }
    await refreshEventTypes(user)
    await publishAdminDataInvalidation(['eventTypes'])
  }

  const items = await readEventTypes()
  const since = parseDateParam(event.queryStringParameters?.since)
  return response(200, since ? collectionChangesSince(items, since, (item) => item.eventType) : items, event)
})

export default getEventTypesLambda
