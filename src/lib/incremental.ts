import type { CollectionResponse } from '../types'

type Timestamp = Date | string | undefined
/**
 * `lastSeen` counts: a user row whose lastSeen was refreshed is a changed row, even though that
 * refresh deliberately leaves modifiedAt - and with it the collection version - alone. The cursor
 * has to advance past it or the next incremental fetch asks for the same rows again.
 */
type TimestampedItem = { lastSeen?: Timestamp; modifiedAt?: Timestamp; updatedAt?: Timestamp }

const timestampValue = (value: Timestamp): number => {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') return Date.parse(value)
  return Number.NaN
}

export const latestCollectionUpdate = <T>(items: T[]): Date | undefined => {
  const latest = items.reduce((max, item) => {
    const { lastSeen, modifiedAt, updatedAt } = item as T & TimestampedItem
    // The same rule the backend applies when it computes a cursor: the latest of the timestamps
    // the row carries, not the first one that happens to be present.
    return [updatedAt, modifiedAt, lastSeen].reduce<number>((latest, value) => {
      const timestamp = timestampValue(value)
      return Number.isNaN(timestamp) ? latest : Math.max(latest, timestamp)
    }, max)
  }, Number.NEGATIVE_INFINITY)

  return Number.isFinite(latest) ? new Date(latest) : undefined
}

export const collectionSince = <T>(items: T[], cursor?: number | null): Date | undefined => {
  if (cursor === null) return undefined
  return cursor === undefined ? latestCollectionUpdate(items) : new Date(cursor)
}

export const collectionResponseCursor = <T>(response: CollectionResponse<T>): number | undefined =>
  Array.isArray(response) ? latestCollectionUpdate(response)?.getTime() : response.cursor

export const reconcileCollection = <T>(
  existing: T[],
  response: CollectionResponse<T>,
  getId: (item: T) => string = (item) => String((item as T & { id: string | number }).id)
): T[] => {
  if (Array.isArray(response)) return response
  if (response.items.length === 0 && response.deletedIds.length === 0) return existing

  const deletedIds = new Set(response.deletedIds)
  const byId = new Map(existing.filter((item) => !deletedIds.has(getId(item))).map((item) => [getId(item), item]))
  for (const item of response.items) byId.set(getId(item), item)
  return [...byId.values()]
}
