export function parseDateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined

  const asNumber = Number(value)
  const d = Number.isFinite(asNumber) ? new Date(asNumber) : new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

interface TimestampedItem {
  deletedAt?: string
  modifiedAt?: string
  updatedAt?: string
}

const getUpdatedAt = (item: TimestampedItem) => {
  const timestamps = [item.updatedAt, item.modifiedAt, item.deletedAt]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))

  if (!timestamps.length) return undefined
  return new Date(Math.max(...timestamps.map((value) => value.getTime())))
}

export const collectionCursor = <T extends TimestampedItem>(items: T[], fallback?: Date) =>
  items.reduce((latest, item) => Math.max(latest, getUpdatedAt(item)?.getTime() ?? latest), fallback?.getTime() ?? 0)

export const changedItemsSince = <T extends TimestampedItem>(items: T[], since: Date) =>
  items.filter((item) => {
    const updatedAt = getUpdatedAt(item)
    return !updatedAt || updatedAt >= since
  })

export function changedSince<T extends TimestampedItem & { id: string }>(items: T[], since: Date) {
  const changed = changedItemsSince(items, since)
  const changedIds = new Set(changed.map((item) => item.id))
  const unchangedIds = items.filter((item) => !changedIds.has(item.id)).map((item) => item.id)

  return { changed, unchangedIds }
}

export const collectionChangesSince = <T extends TimestampedItem>(
  items: T[],
  since: Date,
  getId: (item: T) => string = (item) => String((item as T & { id: string | number }).id)
) => {
  const changed = changedItemsSince(items, since)
  return {
    cursor: collectionCursor(items, since),
    deletedIds: changed.filter((item) => !!item.deletedAt).map(getId),
    items: changed.filter((item) => !item.deletedAt),
  }
}
