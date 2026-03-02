import type { User } from '../types'

type ScoredUser = Pick<User, 'id' | 'roles' | 'officer' | 'judge' | 'admin'>

export const scoreUser = (u: ScoredUser, linkedUserIds?: Set<string>) => {
  const linkedBonus = linkedUserIds?.has(u.id) ? 2000 : 0
  const rolesCount = Object.keys(u.roles ?? {}).length
  const officerCount = Array.isArray(u.officer) ? u.officer.length : 0
  const judgeCount = Array.isArray(u.judge) ? u.judge.length : 0
  const admin = u.admin ? 1000 : 0
  return linkedBonus + admin + rolesCount * 10 + officerCount + judgeCount
}
