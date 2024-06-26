import type { JsonOfficial, JsonUser, Official } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type KLAPI from './KLAPI'

import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'

import { validEmail } from '../../lib/email'
import { CONFIG } from '../config'
import { KLKieli } from '../types/KLAPI'

import { capitalize, reverseName } from './string'

const { officialTable, userTable } = CONFIG

export const fetchOfficialsForEventTypes = async (
  klapi: KLAPI,
  eventTypes: string[]
): Promise<Official[] | undefined> => {
  if (!eventTypes.length) return []

  const officials: Official[] = []

  for (const eventType of eventTypes) {
    const { status, json, error } = await klapi.lueKoemuodonKoetoimitsijat({
      Koemuoto: eventType,
      Kieli: KLKieli.Suomi,
    })

    if (status !== 200 || !json || error) {
      console.error(
        `fetchOfficialsForEventTypes: Failed to fetch officials for event type ${eventType}. Status: ${status}, error: ${error}. Aborting.`
      )

      return undefined
    }

    for (const item of json) {
      // Same official is returned for all the event types it is allowed to be officer for. Avoid duplicates.
      if (officials.find((j) => j.id === item.jäsennumero)) continue

      const name = capitalize(item.nimi)
      const location = capitalize(item.paikkakunta)
      officials.push({
        id: item.jäsennumero,
        name,
        location,
        district: item.kennelpiiri,
        email: item.sähköposti.toLocaleLowerCase(),
        phone: item.puhelin,
        eventTypes: item.koemuodot.map((koemuoto) => koemuoto.lyhenne),
      })
    }
  }

  return officials
}

export const updateOfficials = async (dynamoDB: CustomDynamoClient, officials: Official[]): Promise<void> => {
  if (!officials.length) return

  const existingOfficials = (await dynamoDB.readAll<JsonOfficial>(officialTable)) ?? []
  const newOfficials = officials.filter((o) => !existingOfficials.find((ej) => ej.id === o.id))
  const deletedOfficials = existingOfficials.filter((eo) => !eo.deletedAt && !officials.find((j) => j.id === eo.id))

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

export const updateUsersFromOfficials = async (dynamoDB: CustomDynamoClient, officials: Official[]) => {
  if (!officials.length) return

  const allUsers = (await dynamoDB.readAll<JsonUser>(userTable)) ?? []
  const existingUsers = allUsers.filter((u) => officials.find((o) => o.email === u.email.toLocaleLowerCase()))
  const newOfficials = officials.filter(
    (o) => o.email && !allUsers.find((u) => u.email.toLocaleLowerCase() === o.email)
  )

  const write: JsonUser[] = []
  const modifiedBy = 'system'
  const dateString = new Date().toISOString()

  for (const official of newOfficials) {
    if (!validEmail(official.email)) {
      console.log(`skipping official due to invalid email: ${official.name}, email: ${official.email}`)
      continue
    }
    console.log(`creating user from official: ${official.name}, email: ${official.email}`)
    const newUser: JsonUser = {
      id: nanoid(10),
      createdAt: dateString,
      createdBy: modifiedBy,
      modifiedAt: dateString,
      modifiedBy,
      name: reverseName(official.name),
      email: official.email,
      kcId: official.id,
      officer: official.eventTypes,
      location: official.location,
      phone: official.phone,
    }
    if (official.location) newUser.location = official.location
    if (official.phone) newUser.phone = official.phone

    write.push(newUser)
  }

  for (const existing of existingUsers) {
    const official = officials.find((o) => validEmail(o.email) && o.email === existing.email.toLocaleLowerCase())
    if (!official) continue
    const updated: JsonUser = {
      ...existing,
      name: reverseName(official.name),
      email: official.email,
      kcId: official.id,
      officer: official.eventTypes,
      location: official.location ?? existing.location,
      phone: official.phone ?? existing.phone,
    }
    const changes = Object.keys(diff(existing, updated))
    if (changes.length > 0) {
      console.log(`updating user from official: ${official.name}. changed props: ${changes.join(', ')}`)
      write.push({
        ...updated,
        modifiedAt: dateString,
        modifiedBy,
      })
    }
  }

  if (write.length) {
    try {
      await dynamoDB.batchWrite(write, userTable)
    } catch (e) {
      console.error(e)
      console.log('write:')
      for (const user of write) {
        console.log(user)
      }
    }
  }
}
