import type { EventType } from '../../types'
import type { KLAPIResult, KLKoeHenkilö } from '../types/KLAPI'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type KLAPI from './KLAPI'
import { getChangedTopLevelKeys } from '../../lib/diff'
import { capitalize } from '../../lib/string'
import { authorize } from './auth'
import { collectionChangesSince, parseDateParam } from './incremental'
import { lambda, response } from './lambda'
import { updateUsersFromOfficialsOrJudges } from './user'
import { publishAdminDataInvalidation } from './ws/actions'

interface OfficialDirectoryEntry {
  district: string
  email: string
  eventTypes: string[]
  id: number
  location?: string
  name: string
  phone?: string
}

interface StoredOfficialDirectoryEntry extends OfficialDirectoryEntry {
  deletedAt?: string
  deletedBy?: string
  modifiedAt: string
  modifiedBy: string
}

interface FetchOfficialDirectoryOptions<T extends OfficialDirectoryEntry> {
  errorContext: string
  errorLabel: string
  fetch: (klapi: KLAPI, eventType: string) => KLAPIResult<KLKoeHenkilö[]>
  map: (item: KLKoeHenkilö) => T
}

export const mapOfficialDirectoryEntry = (item: KLKoeHenkilö): OfficialDirectoryEntry => ({
  district: item.kennelpiiri,
  email: item.sähköposti.toLocaleLowerCase(),
  eventTypes: item.koemuodot.map((eventType) => eventType.lyhenne),
  id: item.jäsennumero,
  location: capitalize(item.paikkakunta),
  name: capitalize(item.nimi),
  phone: item.puhelin,
})

export const fetchOfficialDirectory = async <T extends OfficialDirectoryEntry>(
  klapi: KLAPI,
  eventTypes: string[],
  options: FetchOfficialDirectoryOptions<T>
): Promise<T[] | undefined> => {
  const entries = new Map<number, T>()

  for (const eventType of eventTypes) {
    const { status, json, error } = await options.fetch(klapi, eventType)
    if (status !== 200 || !json || error) {
      console.error(
        `${options.errorContext}: Failed to fetch ${options.errorLabel} for event type ${eventType}. Status: ${status}, error: ${error}. Aborting.`
      )
      return undefined
    }

    for (const item of json) {
      if (entries.has(item.jäsennumero)) continue
      const entry = options.map(item)
      entries.set(entry.id, entry)
    }
  }

  return [...entries.values()]
}

interface SyncOfficialDirectoryOptions<
  TIncoming extends OfficialDirectoryEntry,
  TStored extends StoredOfficialDirectoryEntry,
> {
  create: (entry: TIncoming, now: string) => TStored
  label: string
  partialize: (entry: TStored) => TIncoming
  table: string
}

export const syncOfficialDirectory = async <
  TIncoming extends OfficialDirectoryEntry,
  TStored extends StoredOfficialDirectoryEntry,
>(
  dynamoDB: CustomDynamoClient,
  entries: TIncoming[],
  options: SyncOfficialDirectoryOptions<TIncoming, TStored>
): Promise<void> => {
  if (!entries.length) return

  const existingEntries = (await dynamoDB.readAll<TStored>({ table: options.table })) ?? []
  const incomingIds = new Set(entries.map((entry) => entry.id))
  const existingById = new Map(existingEntries.map((entry) => [entry.id, entry]))
  const write: TStored[] = []
  const now = new Date().toISOString()

  for (const entry of entries) {
    const existing = existingById.get(entry.id)
    if (!existing) {
      console.log(`new ${options.label}: ${entry.name} (${entry.id})`)
      write.push(options.create(entry, now))
      continue
    }

    const partial = options.partialize(existing)
    const changes = getChangedTopLevelKeys(partial, { ...partial, ...entry })
    if (changes.length) {
      console.log(`updating ${options.label} ${entry.id}: changes: ${changes.join(', ')}`)
      Object.assign(existing, entry, { modifiedAt: now, modifiedBy: 'system' })
      write.push(existing)
    }
  }

  for (const existing of existingEntries) {
    if (existing.deletedAt || incomingIds.has(existing.id)) continue
    console.log(`deleting ${options.label}: ${existing.name} (${existing.id})`)
    existing.deletedAt = now
    existing.deletedBy = 'system'
    write.push(existing)
  }

  if (write.length) await dynamoDB.batchWrite(write, options.table)
}

interface OfficialDirectoryLambdaOptions<
  TIncoming extends OfficialDirectoryEntry,
  TStored extends StoredOfficialDirectoryEntry,
> {
  collection: 'judges' | 'officials'
  dynamoDB: CustomDynamoClient
  eventTypeTable: string
  fetch: (klapi: KLAPI, eventTypes: string[]) => Promise<TIncoming[] | undefined>
  klapi: () => KLAPI
  role: 'judge' | 'officer'
  service: string
  update: (dynamoDB: CustomDynamoClient, entries: TIncoming[]) => Promise<void>
}

export const createOfficialDirectoryLambda = <
  TIncoming extends OfficialDirectoryEntry,
  TStored extends StoredOfficialDirectoryEntry,
>(
  options: OfficialDirectoryLambdaOptions<TIncoming, TStored>
) =>
  lambda(options.service, async (event) => {
    const user = await authorize(event)
    if (!user) return response(401, 'Unauthorized', event)

    if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
      if (!user.admin) return response(401, 'Unauthorized', event)

      const allEventTypes = await options.dynamoDB.readAll<EventType>({ table: options.eventTypeTable })
      const eventTypes = allEventTypes?.filter((eventType) => eventType.official && eventType.active) ?? []
      const entries = await options.fetch(
        options.klapi(),
        eventTypes.map((eventType) => eventType.eventType)
      )

      if (entries?.length) {
        await options.update(options.dynamoDB, entries)
        await updateUsersFromOfficialsOrJudges(options.dynamoDB, entries, options.role)
      }
      await publishAdminDataInvalidation([options.collection, 'users'])
    }

    const items = (await options.dynamoDB.readAll<TStored>()) ?? []
    const since = parseDateParam(event.queryStringParameters?.since)
    return response(200, since ? collectionChangesSince(items, since) : items.filter((item) => !item.deletedAt), event)
  })
