type AccessUser = { admin?: boolean; roles?: Record<string, unknown> }

export const userHasAdminAccess = (user?: AccessUser | null): boolean =>
  user?.admin === true || Object.keys(user?.roles ?? {}).length > 0

/**
 * What an admin page does with the visitor: `signedOut` goes to login, `unavailable` (a valid token
 * whose /user fetch failed or was refused; GET /user never answers a token with no user) and
 * `denied` (a user with no admin flag and no organizer role) stay on the page with a message, since
 * a signed-in visitor sent to login is sent straight back (KOE-1734).
 */
type AdminAccess = 'granted' | 'denied' | 'unavailable' | 'signedOut'

export const adminAccessOf = (token: string | undefined, user: AccessUser | null): AdminAccess => {
  if (!token) return 'signedOut'
  if (!user) return 'unavailable'
  return userHasAdminAccess(user) ? 'granted' : 'denied'
}

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
