export function parseDateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined

  const asNumber = Number(value)
  const d = Number.isFinite(asNumber) ? new Date(asNumber) : new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function changedSince<T extends { id: string; modifiedAt?: string }>(items: T[], since: Date) {
  const changed = items.filter((item) => {
    const modifiedAt = item.modifiedAt
    if (typeof modifiedAt !== 'string') return true
    const modifiedAtDate = new Date(modifiedAt)
    return Number.isNaN(modifiedAtDate.getTime()) || modifiedAtDate >= since
  })
  const unchangedIds = items
    .filter((item) => {
      const modifiedAt = item.modifiedAt
      if (typeof modifiedAt !== 'string') return false
      const modifiedAtDate = new Date(modifiedAt)
      return !Number.isNaN(modifiedAtDate.getTime()) && modifiedAtDate < since
    })
    .map((item) => item.id)

  return { changed, unchangedIds }
}
