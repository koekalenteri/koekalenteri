export function parseDateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined

  const asNumber = Number(value)
  const d = Number.isFinite(asNumber) ? new Date(asNumber) : new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function getUpdatedAt(item: { modifiedAt?: string; updatedAt?: string }) {
  return item.updatedAt ?? item.modifiedAt
}

export function changedSince<T extends { id: string; modifiedAt?: string; updatedAt?: string }>(
  items: T[],
  since: Date
) {
  const changed = items.filter((item) => {
    const updatedAt = getUpdatedAt(item)
    if (typeof updatedAt !== 'string') return true
    const updatedAtDate = new Date(updatedAt)
    return Number.isNaN(updatedAtDate.getTime()) || updatedAtDate >= since
  })
  const unchangedIds = items
    .filter((item) => {
      const updatedAt = getUpdatedAt(item)
      if (typeof updatedAt !== 'string') return false
      const updatedAtDate = new Date(updatedAt)
      return !Number.isNaN(updatedAtDate.getTime()) && updatedAtDate < since
    })
    .map((item) => item.id)

  return { changed, unchangedIds }
}
