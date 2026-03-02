import type { JsonUser } from '../../types'

export const scoreUser = (u: JsonUser, linkedUserIds?: Set<string>) => {
  const linkedBonus = linkedUserIds?.has(u.id) ? 2000 : 0
  const rolesCount = Object.keys(u.roles ?? {}).length
  const officerCount = Array.isArray(u.officer) ? u.officer.length : 0
  const judgeCount = Array.isArray(u.judge) ? u.judge.length : 0
  const admin = u.admin ? 1000 : 0
  return linkedBonus + admin + rolesCount * 10 + officerCount + judgeCount
}

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
