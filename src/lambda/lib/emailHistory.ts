import type { JsonUser } from '../../types'

export type EmailHistoryEntry = NonNullable<JsonUser['emailHistory']>[number]

export const appendEmailHistory = (
  existing: JsonUser | undefined,
  previousEmail: string | undefined,
  nextEmail: string | undefined,
  nowIso: string,
  source: EmailHistoryEntry['source']
): JsonUser['emailHistory'] | undefined => {
  if (!previousEmail || !nextEmail) return existing?.emailHistory
  const prev = previousEmail.toLocaleLowerCase().trim()
  const next = nextEmail.toLocaleLowerCase().trim()
  if (!prev || !next || prev === next) return existing?.emailHistory

  const prior = existing?.emailHistory ?? []
  const entry: EmailHistoryEntry = { changedAt: nowIso, email: prev, source }

  // Keep at most 10 entries, newest last.
  return [...prior, entry].slice(-10)
}
