import type { JsonJudge, Judge, RequireAllKeys } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type KLAPI from './KLAPI'

import { diff } from 'deep-object-diff'

import { CONFIG } from '../config'
import { KLKieli } from '../types/KLAPI'

import { capitalize } from './string'

const { judgeTable } = CONFIG

export type PartialJsonJudge = Omit<Judge, 'languages' | 'active'>

export const fetchJudgesForEventTypes = async (
  klapi: KLAPI,
  eventTypes: string[]
): Promise<PartialJsonJudge[] | undefined> => {
  if (!eventTypes.length) return []

  const judges: PartialJsonJudge[] = []

  for (const eventType of eventTypes) {
    const { status, json, error } = await klapi.lueKoemuodonYlituomarit({
      Koemuoto: eventType,
      Kieli: KLKieli.Suomi,
    })

    if (status !== 200 || !json || error) {
      console.error(
        `fetchJudgesForEventTypes: Failed to fetch judges for event type ${eventType}. Status: ${status}, error: ${error}. Aborting.`
      )

      return undefined
    }

    for (const item of json) {
      // Same judge is returned for all the event types it is allowed to judge. Avoid duplicates.
      if (judges.find((j) => j.id === item.jäsennumero)) continue

      const name = capitalize(item.nimi)
      const location = capitalize(item.paikkakunta)
      judges.push({
        id: item.jäsennumero,
        name,
        location,
        district: item.kennelpiiri,
        email: item.sähköposti.toLocaleLowerCase(),
        phone: item.puhelin,
        eventTypes: item.koemuodot.map((koemuoto) => koemuoto.lyhenne),
        official: true,
      })
    }
  }

  return judges
}

export const partializeJudge = (judge: JsonJudge): RequireAllKeys<PartialJsonJudge> => ({
  district: judge.district,
  email: judge.email,
  eventTypes: judge.eventTypes,
  id: judge.id,
  location: judge.location,
  name: judge.name,
  official: judge.official,
  phone: judge.phone,
})

export const updateJudges = async (dynamoDB: CustomDynamoClient, judges: PartialJsonJudge[]): Promise<void> => {
  if (!judges.length) return

  const existingJudges = (await dynamoDB.readAll<JsonJudge>(judgeTable)) ?? []
  const newJudges = judges.filter((j) => !existingJudges.find((ej) => ej.id === j.id))
  const deletedJudges = existingJudges.filter((ej) => !ej.deletedAt && !judges.find((j) => j.id === ej.id))

  const write: JsonJudge[] = []
  const now = new Date().toISOString()

  // New
  for (const judge of newJudges) {
    console.log(`new judge: ${judge.name} (${judge.id})`)
    const added: JsonJudge = {
      active: true,
      languages: [],
      createdAt: now,
      createdBy: 'system',
      modifiedAt: now,
      modifiedBy: 'system',
      ...judge,
    }
    write.push(added)
  }

  // Updated
  for (const judge of judges) {
    const existing = existingJudges.find((j) => j.id === judge.id)
    if (!existing) continue
    const partial = partializeJudge(existing)
    const changes = Object.keys(diff(partial, { ...partial, ...judge }))
    if (changes.length > 0) {
      console.log(`updating judge ${judge.id}: changes: ${changes.join(', ')}`)
      const updated: JsonJudge = {
        ...existing,
        ...judge,
        modifiedAt: now,
        modifiedBy: 'system',
      }
      write.push(updated)
    }
  }

  // Deleted
  for (const judge of deletedJudges) {
    console.log(`deleting judge: ${judge.name} (${judge.id})`)
    judge.deletedAt = now
    judge.deletedBy = 'system'

    write.push(judge)
  }

  if (write.length) {
    await dynamoDB.batchWrite(write, judgeTable)
  }
}
