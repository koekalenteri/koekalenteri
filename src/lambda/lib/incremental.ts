import { itemStamp } from '../../lib/incremental'

export function parseDateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined

  const asNumber = Number(value)
  const d = Number.isFinite(asNumber) ? new Date(asNumber) : new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

type TimestampedItem = Parameters<typeof itemStamp>[0]

/** The latest stamp a row carries, the one `changedSince` judges it by. */
const itemUpdatedAt = (item: TimestampedItem) => {
  const stamp = itemStamp(item)
  return stamp === undefined ? undefined : new Date(stamp)
}

export const collectionCursor = <T extends TimestampedItem>(items: T[], fallback?: Date) =>
  items.reduce((latest, item) => Math.max(latest, itemUpdatedAt(item)?.getTime() ?? latest), fallback?.getTime() ?? 0)

export const changedItemsSince = <T extends TimestampedItem>(items: T[], since: Date) =>
  items.filter((item) => {
    const updatedAt = itemUpdatedAt(item)
    return !updatedAt || updatedAt >= since
  })

/**
 * `unchanged` carries each quiet row's stamp: "unchanged since `since`" says nothing about a copy a
 * client took long before, and the stamp is what tells a current copy from a stale one (KOE-1501).
 * A row with no stamp is never quiet, so every unchanged row has one.
 */
export function changedSince<T extends TimestampedItem & { id: string }>(items: T[], since: Date) {
  const changed: T[] = []
  const unchanged: { id: string; updatedAt: string }[] = []

  for (const item of items) {
    const updatedAt = itemUpdatedAt(item)
    if (!updatedAt || updatedAt >= since) changed.push(item)
    else unchanged.push({ id: item.id, updatedAt: updatedAt.toISOString() })
  }

  return { changed, unchanged, unchangedIds: unchanged.map(({ id }) => id) }
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
