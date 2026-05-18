import type { JsonUser } from '../../types'

const userHasRoleForOrg = (user: JsonUser | null | undefined, orgId: string, role: string): boolean => {
  if (!user || !orgId) return false
  return user.roles?.[orgId] === role
}

export const isGlobalAdmin = (user: JsonUser | null | undefined): boolean => Boolean(user?.admin)

export const isOrganizerAdmin = (user: JsonUser | null | undefined, orgId: string): boolean =>
  userHasRoleForOrg(user, orgId, 'admin')

export const isMemberOfOrganizer = (user: JsonUser | null | undefined, orgId: string): boolean => {
  if (!user || !orgId) return false
  return Boolean(user.roles?.[orgId])
}

export const canManageUserAdminFlag = (
  actor: JsonUser | null | undefined,
  targetUserId: string | undefined
): boolean => {
  if (!actor || !targetUserId) return false
  if (actor.id === targetUserId) return false
  return isGlobalAdmin(actor)
}

export const canManageUserRole = (
  actor: JsonUser | null | undefined,
  targetUserId: string | undefined,
  orgId: string | undefined
): boolean => {
  if (!actor || !targetUserId || !orgId) return false
  if (actor.id === targetUserId) return false
  return isGlobalAdmin(actor) || isOrganizerAdmin(actor, orgId)
}
