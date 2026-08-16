export const userHasAdminAccess = (user?: { admin?: boolean; roles?: Record<string, unknown> } | null): boolean =>
  user?.admin === true || Object.keys(user?.roles ?? {}).length > 0

type ScoredUser = {
  id: string
  roles?: Record<string, unknown>
  officer?: unknown[]
  judge?: unknown[]
  admin?: boolean
}

export const scoreUser = (user: ScoredUser, linkedUserIds?: Set<string>) => {
  const linkedBonus = linkedUserIds?.has(user.id) ? 2000 : 0
  const rolesCount = Object.keys(user.roles ?? {}).length
  const officerCount = Array.isArray(user.officer) ? user.officer.length : 0
  const judgeCount = Array.isArray(user.judge) ? user.judge.length : 0
  const admin = user.admin ? 1000 : 0
  return linkedBonus + admin + rolesCount * 10 + officerCount + judgeCount
}
