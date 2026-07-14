import type { CollectionResponse } from '../types'

type TimestampedItem = { modifiedAt?: Date | string; updatedAt?: Date | string }

export const latestCollectionUpdate = <T>(items: T[]): Date | undefined => {
  const latest = items.reduce((max, item) => {
    const { modifiedAt, updatedAt } = item as T & TimestampedItem
    const value = updatedAt ?? modifiedAt
    const timestamp =
      value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : Number.NaN
    return Number.isNaN(timestamp) ? max : Math.max(max, timestamp)
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

  const deletedIds = new Set(response.deletedIds)
  const byId = new Map(existing.filter((item) => !deletedIds.has(getId(item))).map((item) => [getId(item), item]))
  for (const item of response.items) byId.set(getId(item), item)
  return [...byId.values()]
}
