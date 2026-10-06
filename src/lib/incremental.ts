import type { CollectionResponse } from '../types'

type Timestamp = Date | string
/**
 * `lastSeen` counts: a user row whose lastSeen was refreshed is a changed row, even though that
 * refresh deliberately leaves modifiedAt - and with it the collection version - alone. The cursor
 * has to advance past it or the next incremental fetch asks for the same rows again.
 * `deletedAt` counts for the same reason: a deletion is a change.
 */
export type TimestampedItem = {
  deletedAt?: Timestamp
  lastSeen?: Timestamp
  modifiedAt?: Timestamp
  updatedAt?: Timestamp
}

const timestampValue = (value?: Timestamp): number => {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') return Date.parse(value)
  return Number.NaN
}

/**
 * The latest stamp a row carries (epoch ms), not the first one that happens to be present. The one
 * rule both the backend (what is changed, what the cursor is) and the client (is my copy current)
 * judge a row by, so the two cannot drift apart (KOE-1501).
 */
export const itemStamp = (item: TimestampedItem): number | undefined => {
  const { deletedAt, lastSeen, modifiedAt, updatedAt } = item
  const latest = [updatedAt, modifiedAt, deletedAt, lastSeen].reduce<number>((max, value) => {
    const timestamp = timestampValue(value)
    return Number.isNaN(timestamp) ? max : Math.max(max, timestamp)
  }, Number.NEGATIVE_INFINITY)

  return Number.isFinite(latest) ? latest : undefined
}

export const latestCollectionUpdate = <T>(items: T[]): Date | undefined => {
  const latest = items.reduce<number>(
    (max, item) => Math.max(max, itemStamp(item as T & TimestampedItem) ?? Number.NEGATIVE_INFINITY),
    Number.NEGATIVE_INFINITY
  )

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
