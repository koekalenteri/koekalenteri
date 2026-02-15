import type { JsonOfficial, Official } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type KLAPI from './KLAPI'
import { diff } from 'deep-object-diff'
import { CONFIG } from '../config'
import { KLKieli } from '../types/KLAPI'
import { capitalize } from './string'

const { officialTable } = CONFIG

export const fetchOfficialsForEventTypes = async (
  klapi: KLAPI,
  eventTypes: string[]
): Promise<Official[] | undefined> => {
  if (!eventTypes.length) return []

  const officials: Official[] = []

  for (const eventType of eventTypes) {
    const { status, json, error } = await klapi.lueKoemuodonKoetoimitsijat({
      Kieli: KLKieli.Suomi,
      Koemuoto: eventType,
    })

    if (status !== 200 || !json || error) {
      console.error(
        `fetchOfficialsForEventTypes: Failed to fetch officials for event type ${eventType}. Status: ${status}, error: ${error}. Aborting.`
      )

      return undefined
    }

    for (const item of json) {
      // Same official is returned for all the event types it is allowed to be officer for. Avoid duplicates.
      if (officials.some((j) => j.id === item.jäsennumero)) continue

      const name = capitalize(item.nimi)
      const location = capitalize(item.paikkakunta)
      officials.push({
        district: item.kennelpiiri,
        email: item.sähköposti.toLocaleLowerCase(),
        eventTypes: item.koemuodot.map((koemuoto) => koemuoto.lyhenne),
        id: item.jäsennumero,
        location,
        name,
        phone: item.puhelin,
      })
    }
  }

  return officials
}

export const updateOfficials = async (dynamoDB: CustomDynamoClient, officials: Official[]): Promise<void> => {
  if (!officials.length) return

  const existingOfficials = (await dynamoDB.readAll<JsonOfficial>(officialTable)) ?? []
  const newOfficials = officials.filter((o) => !existingOfficials.some((ej) => ej.id === o.id))
  const deletedOfficials = existingOfficials.filter((eo) => !eo.deletedAt && !officials.some((j) => j.id === eo.id))

  const write: JsonOfficial[] = []
  const now = new Date().toISOString()

  // New
  for (const official of newOfficials) {
    console.log(`new official: ${official.name} (${official.id})`)
    const added: JsonOfficial = {
      createdAt: now,
      createdBy: 'system',
      modifiedAt: now,
      modifiedBy: 'system',
      ...official,
    }
    write.push(added)
  }

  // Updated
  for (const official of officials) {
    const existing = existingOfficials.find((j) => j.id === official.id)
    if (!existing) continue
    const changes = Object.keys(diff(existing, { ...existing, ...official }))
    if (changes.length > 0) {
      console.log(`updating official ${official.id}: changes: ${changes.join(', ')}`)
      const updated: JsonOfficial = {
        ...existing,
        ...official,
        modifiedAt: now,
        modifiedBy: 'system',
      }
      write.push(updated)
    }
  }

  // Deleted
  for (const official of deletedOfficials) {
    console.log(`deleting official: ${official.name} (${official.id})`)
    official.deletedAt = now
    official.deletedBy = 'system'

    write.push(official)
  }

  if (write.length) {
    await dynamoDB.batchWrite(write, officialTable)
  }
}
