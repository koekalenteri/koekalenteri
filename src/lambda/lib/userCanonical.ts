import type { JsonUser } from '../../types'
import { scoreUser } from '../../lib/userCanonical'

export const compareUsersForCanonical = (a: JsonUser, b: JsonUser, linkedUserIds?: Set<string>) => {
  const ds = scoreUser(b, linkedUserIds) - scoreUser(a, linkedUserIds)
  if (ds !== 0) return ds
  const ta = a.modifiedAt ? Date.parse(a.modifiedAt) : 0
  const tb = b.modifiedAt ? Date.parse(b.modifiedAt) : 0
  return tb - ta
}

export const pickCanonicalUserPreferLinked = (users: JsonUser[], linkedUserIds?: Set<string>): JsonUser => {
  return [...users].sort((a, b) => compareUsersForCanonical(a, b, linkedUserIds))[0]
}

export const pickCanonicalUser = (users: JsonUser[]): JsonUser => {
  return pickCanonicalUserPreferLinked(users)
}

export const preferCanonical = (a: JsonUser, b: JsonUser, linkedUserIds?: Set<string>) =>
  pickCanonicalUserPreferLinked([a, b], linkedUserIds)
