import type { JsonUser } from '../../types'
import { filterRelevantUsers } from './user'
import { callerScopes, DIRECTORY_SCOPE, GLOBAL_SCOPE, userScopes } from './userScopes'

const user = (props: Partial<JsonUser>): JsonUser =>
  ({ createdAt: '', createdBy: '', email: '', id: '', modifiedAt: '', modifiedBy: '', name: '', ...props }) as JsonUser

describe('userScopes', () => {
  it('puts every record in the global scope', () => {
    expect(userScopes(user({}))).toEqual([GLOBAL_SCOPE])
  })

  it('puts admins, judges and officials in the directory scope', () => {
    expect(userScopes(user({ admin: true }))).toContain(DIRECTORY_SCOPE)
    expect(userScopes(user({ judge: ['NOME-B'] }))).toContain(DIRECTORY_SCOPE)
    expect(userScopes(user({ officer: ['NOME-B'] }))).toContain(DIRECTORY_SCOPE)
    expect(userScopes(user({ judge: [], officer: [] }))).not.toContain(DIRECTORY_SCOPE)
  })

  it('puts a record in the scope of every organization it has a role in', () => {
    expect(userScopes(user({ roles: { org1: 'secretary', org2: 'admin' } }))).toEqual([GLOBAL_SCOPE, 'org1', 'org2'])
  })
})

describe('callerScopes', () => {
  it('reads the global scope for a global admin', () => {
    expect(callerScopes(user({ admin: true, roles: { org1: 'secretary' } }))).toEqual([GLOBAL_SCOPE])
  })

  it('reads the directory and the caller organizations', () => {
    expect(callerScopes(user({ roles: { org1: 'secretary', org2: 'admin' } }))).toEqual([
      DIRECTORY_SCOPE,
      'org1',
      'org2',
    ])
  })

  it('ignores organizations the caller is not a member of', () => {
    expect(callerScopes(user({ roles: { org1: 'secretary' } }), ['org1', 'other'])).toEqual([DIRECTORY_SCOPE, 'org1'])
  })
})

describe('scopes match the relevance rule', () => {
  // The rule spelled out independently of the implementation: a record is relevant when it belongs
  // to a global admin's caller, or is an admin/judge/official, or has a role in one of the caller's
  // organizations. Versions are scoped by the same two functions, so this test is what keeps a
  // change to the filtering from silently leaving stale caches behind.
  const isRelevant = (record: JsonUser, caller: JsonUser, orgs: string[]) =>
    Boolean(
      caller.admin ||
        record.admin ||
        record.judge?.length ||
        record.officer?.length ||
        Object.keys(record.roles ?? {}).some((orgId) => orgs.includes(orgId) && !!caller.roles?.[orgId])
    )

  const records = [
    user({ id: 'plain' }),
    user({ admin: true, id: 'admin' }),
    user({ id: 'judge', judge: ['NOME-B'] }),
    user({ id: 'officer', officer: ['NOME-B'] }),
    user({ id: 'org1-secretary', roles: { org1: 'secretary' } }),
    user({ id: 'org2-secretary', roles: { org2: 'secretary' } }),
    user({ id: 'both', roles: { org1: 'admin', org2: 'secretary' } }),
  ]

  const callers = [
    user({ admin: true, id: 'global-admin' }),
    user({ id: 'org1-caller', roles: { org1: 'secretary' } }),
    user({ id: 'org2-caller', roles: { org2: 'admin' } }),
    user({ id: 'no-org-caller' }),
  ]

  it.each(callers.map((caller) => [caller.id, caller] as const))('holds for %s', (_id, caller) => {
    const orgs = Object.keys(caller.roles ?? {})
    const relevant = filterRelevantUsers(records, caller, orgs)
    const scopes = new Set(callerScopes(caller, orgs))

    for (const record of records) {
      const intersects = userScopes(record).some((scope) => scopes.has(scope))
      expect({ id: record.id, intersects }).toEqual({ id: record.id, intersects: isRelevant(record, caller, orgs) })
      expect(relevant.includes(record)).toBe(intersects)
    }
  })
})
