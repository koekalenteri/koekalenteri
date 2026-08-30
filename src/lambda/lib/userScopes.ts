import type { JsonUser } from '../../types'

/** Every user record belongs to this scope: it is what a global admin's cache compares against. */
export const GLOBAL_SCOPE = '*'
/** Admins, judges and officials are part of every caller's user list, whatever their organization. */
export const DIRECTORY_SCOPE = 'directory'

export const userIsMemberOf = (user: Pick<JsonUser, 'roles'>): string[] =>
  Object.keys(user?.roles ?? {}).filter((orgId) => !!user?.roles?.[orgId])

type ScopedUser = Pick<JsonUser, 'admin' | 'judge' | 'officer' | 'roles'>

/**
 * The scopes a user record belongs to, i.e. whose cached user lists contain it.
 *
 * Together with `callerScopes()` this *is* the relevance rule: a record is relevant to a caller
 * exactly when the two scope sets intersect, which is how `filterRelevantUsers` is implemented.
 * Keeping both sides of that invariant in this one file is what stops the versions from drifting
 * away from the filtering.
 */
export const userScopes = (user: ScopedUser): string[] => [
  GLOBAL_SCOPE,
  ...(user.admin || user.judge?.length || user.officer?.length ? [DIRECTORY_SCOPE] : []),
  ...Object.keys(user.roles ?? {}),
]

/** The scopes a caller's user list is assembled from. */
export const callerScopes = (user: ScopedUser, orgs?: string[]): string[] => {
  if (user.admin) return [GLOBAL_SCOPE]

  const memberOf = userIsMemberOf(user)

  return [DIRECTORY_SCOPE, ...(orgs ? orgs.filter((orgId) => memberOf.includes(orgId)) : memberOf)]
}
