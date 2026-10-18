import type { AdminDataCollection } from '../../types'
import type { KLAPIResult, KLKoeHenkilö } from '../types/KLAPI'
import type KLAPI from './KLAPI'
import { getChangedTopLevelKeys } from '../../lib/diff'
import { capitalize } from '../../lib/string'
import { authorize } from './auth'
import { collectionChangesSince, parseDateParam } from './incremental'
import { httpError, lambda, response } from './lambda'
import { logger } from './log'
import { readEventTypes } from './repositories/eventTypeRepository'
import { updateUsersFromOfficialsOrJudges } from './user'

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
      logger.error('failed to fetch official directory, aborting', {
        context: options.errorContext,
        error,
        eventType,
        label: options.errorLabel,
        status,
      })
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
  /** The directory as stored, the deleted entries included, from the table's repository. */
  readAll: () => Promise<TStored[]>
  /** Stores the new, changed, restored and deleted entries, through the table's repository. */
  writeAll: (entries: TStored[]) => Promise<void>
}

/**
 * Updates a stored entry from the Kennel Club's list in place and says whether it needs writing. A
 * deleted entry back on the list is restored even when its fields did not change, and keeps what
 * the app stored for it (a judge's languages, say) rather than being created anew (KOE-1569).
 */
const updateStoredEntry = <TIncoming extends OfficialDirectoryEntry, TStored extends StoredOfficialDirectoryEntry>(
  existing: TStored,
  entry: TIncoming,
  options: Pick<SyncOfficialDirectoryOptions<TIncoming, TStored>, 'label' | 'partialize'>,
  now: string
): boolean => {
  const stamp = { modifiedAt: now, modifiedBy: 'system' }

  if (existing.deletedAt) {
    logger.info('restoring directory entry', { id: entry.id, label: options.label })
    // Undefined attributes are left out of the stored row (removeUndefinedValues).
    Object.assign(existing, entry, stamp, { deletedAt: undefined, deletedBy: undefined })
    return true
  }

  const partial = options.partialize(existing)
  const changes = getChangedTopLevelKeys(partial, { ...partial, ...entry })
  if (!changes.length) return false

  logger.info('updating directory entry', { changedKeys: changes, id: entry.id, label: options.label })
  Object.assign(existing, entry, stamp)
  return true
}

export const syncOfficialDirectory = async <
  TIncoming extends OfficialDirectoryEntry,
  TStored extends StoredOfficialDirectoryEntry,
>(
  entries: TIncoming[],
  options: SyncOfficialDirectoryOptions<TIncoming, TStored>
): Promise<void> => {
  if (!entries.length) return

  const existingEntries = await options.readAll()
  const incomingIds = new Set(entries.map((entry) => entry.id))
  const existingById = new Map(existingEntries.map((entry) => [entry.id, entry]))
  const write: TStored[] = []
  const now = new Date().toISOString()

  for (const entry of entries) {
    const existing = existingById.get(entry.id)
    if (!existing) {
      // The id, not the name: a judge's or officer's name is personal data that has no business
      // sitting in CloudWatch for the whole retention period.
      logger.info('new directory entry', { id: entry.id, label: options.label })
      write.push(options.create(entry, now))
      continue
    }

    if (updateStoredEntry(existing, entry, options, now)) write.push(existing)
  }

  for (const existing of existingEntries) {
    if (existing.deletedAt || incomingIds.has(existing.id)) continue
    logger.info('deleting directory entry', { id: existing.id, label: options.label })
    existing.deletedAt = now
    existing.deletedBy = 'system'
    write.push(existing)
  }

  if (write.length) await options.writeAll(write)
}

interface OfficialDirectoryLambdaOptions<
  TIncoming extends OfficialDirectoryEntry,
  TStored extends StoredOfficialDirectoryEntry,
> {
  collection: 'judges' | 'officials'
  fetch: (klapi: KLAPI, eventTypes: string[]) => Promise<TIncoming[] | undefined>
  klapi: () => KLAPI
  /**
   * Tells open admin clients their copy of this collection is stale. Handed in rather than reached
   * for, so this module -- and every lambda built from it -- stays clear of the WebSocket sender
   * (KOE-1340).
   */
  onRefreshed: (collections: AdminDataCollection[]) => Promise<unknown>
  /**
   * The directory as stored, the deleted entries included, from the table's repository: a `since`
   * response reports them as deletedIds, the full list leaves them out (KOE-1569).
   */
  readAll: () => Promise<TStored[]>
  role: 'judge' | 'officer'
  service: string
  update: (entries: TIncoming[]) => Promise<void>
}

export const createOfficialDirectoryLambda = <
  TIncoming extends OfficialDirectoryEntry,
  TStored extends StoredOfficialDirectoryEntry,
>(
  options: OfficialDirectoryLambdaOptions<TIncoming, TStored>
) =>
  lambda(options.service, async (event) => {
    const user = await authorize(event)
    if (!user) throw httpError(401, 'Unauthorized')

    if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
      if (!user.admin) throw httpError(401, 'Unauthorized')

      const allEventTypes = await readEventTypes()
      const eventTypes = allEventTypes.filter((eventType) => eventType.official && eventType.active)
      const entries = await options.fetch(
        options.klapi(),
        eventTypes.map((eventType) => eventType.eventType)
      )

      if (entries?.length) {
        await options.update(entries)
        await updateUsersFromOfficialsOrJudges(entries, options.role)
      }
      await options.onRefreshed([options.collection, 'users'])
    }

    const items = await options.readAll()
    const since = parseDateParam(event.queryStringParameters?.since)
    return response(200, since ? collectionChangesSince(items, since) : items.filter((item) => !item.deletedAt), event)
  })
