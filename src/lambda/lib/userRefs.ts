export const normalizeUserId = (id: string | number | undefined): string | undefined => {
  if (id === undefined || id === null) return undefined
  return String(id)
}

export const compressCanonicalMap = (duplicateIdToCanonicalId: Map<string, string>) => {
  const resolveFinalCanonicalId = (id: string): string => {
    const seen = new Set<string>()
    let current = id
    while (duplicateIdToCanonicalId.has(current) && !seen.has(current)) {
      seen.add(current)
      current = duplicateIdToCanonicalId.get(current) as string
    }
    return current
  }

  for (const [duplicateId, canonicalId] of duplicateIdToCanonicalId.entries()) {
    const resolved = resolveFinalCanonicalId(canonicalId)
    if (resolved !== canonicalId) duplicateIdToCanonicalId.set(duplicateId, resolved)
  }
}
