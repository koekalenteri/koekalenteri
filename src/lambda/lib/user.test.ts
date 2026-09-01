import type { JsonDbRecord, JsonUser, Official } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type { PartialJsonJudge } from './judge'
import { vi } from 'vitest'

vi.useFakeTimers()
vi.setSystemTime(new Date('2024-05-30T20:00:00Z'))
vi.doMock('nanoid', () => {
  let i = 0
  return { nanoid: () => `test-id-${++i}` }
})

const mockEventReadAll = vi.fn()
const mockEventUpdate = vi.fn()
const mockUserReadAll = vi.fn()
const mockUserLinkReadAll = vi.fn()
const mockUserQuery = vi.fn()
const mockUserRead = vi.fn()
const mockUserWrite = vi.fn()
const mockUserUpdate = vi.fn()
const mockSendTemplatedMail = vi.fn()

vi.doMock('./email', () => ({
  sendTemplatedMail: (...args: any[]) => mockSendTemplatedMail(...args),
}))

// `updateUsersFromOfficialsOrJudges()` creates a separate Dynamo client for events.
// Mock it so tests stay fully in-memory.
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    table: string

    constructor(tableName: string) {
      this.table = tableName
    }

    readAll = ({ table }: { table?: string } = {}) => {
      if (table?.includes('event')) return mockEventReadAll(table)
      if (table?.includes('user-link')) return mockUserLinkReadAll(table)
      return mockUserReadAll(table)
    }

    query = (...args: any[]) => mockUserQuery(...args)

    read = (...args: any[]) => mockUserRead(...args)

    write = (...args: any[]) => mockUserWrite(...args)

    update = (...args: any[]) => {
      const table = args[2]
      if (typeof table === 'string' && table.includes('event')) return mockEventUpdate(...args)
      return mockUserUpdate(...args)
    }
  },
}))

const {
  callerScopes,
  dedupeUsersByEmail,
  compareUsersForCanonical,
  DIRECTORY_SCOPE,
  filterRelevantUsers,
  GLOBAL_SCOPE,
  userScopes,
  getAllUsers,
  findUserByEmail,
  pickCanonicalUser,
  pickCanonicalUserPreferLinked,
  preferCanonical,
  updateUser,
  setUserRole,
  updateUsersFromOfficialsOrJudges,
  __testables,
} = await import('./user')

describe('user reference helpers', () => {
  it('normalizes number/string ids and handles undefined', () => {
    expect(__testables.normalizeUserId(123)).toBe('123')
    expect(__testables.normalizeUserId('abc')).toBe('abc')
    expect(__testables.normalizeUserId(undefined)).toBeUndefined()
  })

  it('performs canonical-id path compression', () => {
    const map = new Map<string, string>([
      ['A', 'B'],
      ['B', 'C'],
      ['X', 'Y'],
    ])

    __testables.compressCanonicalMap(map)

    expect(map.get('A')).toBe('C')
    expect(map.get('B')).toBe('C')
    expect(map.get('X')).toBe('Y')
  })
})

const defaults: Omit<JsonDbRecord, 'id'> = {
  createdAt: '2020-11-12T11:11:11.000Z',
  createdBy: 'system',
  modifiedAt: '2020-11-12T11:11:11.000Z',
  modifiedBy: 'system',
}

const admin: JsonUser = { ...defaults, admin: true, email: 'a@exmaple.com', id: 'a', name: 'admin' }
const judge: JsonUser = { ...defaults, email: 'b@exmaple.com', id: 'b', judge: ['NOME-B'], name: 'judge' }
const officer: JsonUser = { ...defaults, email: 'c@exmaple.com', id: 'c', name: 'officer', officer: ['NOME-B'] }
const orgAdmin: JsonUser = {
  ...defaults,
  email: 'd@exmaple.com',
  id: 'd',
  name: 'org admin',
  roles: { testOrg: 'admin' },
}
const orgSecretary: JsonUser = {
  ...defaults,
  email: 'e@exmaple.com',
  id: 'e',
  name: 'org secretary',
  roles: { testOrg: 'secretary' },
}
const otherOrgAdmin: JsonUser = {
  ...defaults,
  email: 'f@exmaple.com',
  id: 'f',
  name: 'other org admin',
  roles: { otherOrg: 'admin' },
}
const otherOrgSecretary: JsonUser = {
  ...defaults,
  email: 'g@exmaple.com',
  id: 'g',
  name: 'other org secretary',
  roles: { otherOrg: 'secretary' },
}
const justUser: JsonUser = { ...defaults, email: 'h@exmaple.com', id: 'h', name: 'common user' }

const testUsers: JsonUser[] = [
  admin,
  judge,
  officer,
  orgAdmin,
  orgSecretary,
  otherOrgAdmin,
  otherOrgSecretary,
  justUser,
]

describe('canonical users', () => {
  it('prefers higher score, then newer modifiedAt', () => {
    const a: JsonUser = { ...defaults, email: 'a@example.com', id: 'a', name: 'A' }
    const b: JsonUser = { ...defaults, email: 'b@example.com', id: 'b', name: 'B', roles: { org: 'admin' } }
    expect(compareUsersForCanonical(a, b)).toBeGreaterThan(0)

    const older: JsonUser = {
      ...defaults,
      email: 'o@example.com',
      id: 'o',
      modifiedAt: '2020-01-01T00:00:00.000Z',
      name: 'Old',
    }
    const newer: JsonUser = {
      ...defaults,
      email: 'n@example.com',
      id: 'n',
      modifiedAt: '2021-01-01T00:00:00.000Z',
      name: 'New',
    }
    expect(compareUsersForCanonical(older, newer)).toBeGreaterThan(0)
  })

  it('prefers linked users and supports convenience wrappers', () => {
    const base: JsonUser = { ...defaults, email: 'u1@example.com', id: 'u1', name: 'u1' }
    const rich: JsonUser = { ...defaults, email: 'u2@example.com', id: 'u2', name: 'u2', roles: { org: 'admin' } }

    expect(pickCanonicalUserPreferLinked([base, rich], new Set(['u1'])).id).toBe('u1')
    expect(pickCanonicalUser([base, rich]).id).toBe('u2')
    expect(preferCanonical(base, rich).id).toBe('u2')
  })

  it('treats a missing modifiedAt as older than a present timestamp', () => {
    const undated = { id: 'undated' }
    const dated = { id: 'dated', modifiedAt: '2021-01-01T00:00:00.000Z' }

    expect(compareUsersForCanonical(undated, dated)).toBeGreaterThan(0)
    expect(compareUsersForCanonical(dated, undated)).toBeLessThan(0)
  })
})

describe('dedupeUsersByEmail', () => {
  it('returns empty array for empty input', () => {
    expect(dedupeUsersByEmail([])).toEqual([])
  })

  it('returns all users when emails are unique', () => {
    const users = [
      { email: 'a@example.com', id: '1' },
      { email: 'b@example.com', id: '2' },
      { email: 'c@example.com', id: '3' },
    ]
    expect(dedupeUsersByEmail(users)).toEqual(users)
  })

  it('deduplicates case-insensitively, keeping the higher-scored user', () => {
    const lower = { email: 'user@example.com', id: 'low', roles: {} }
    const upper = { email: 'User@Example.COM', id: 'high', roles: { org1: 'admin' as const } }
    const result = dedupeUsersByEmail([lower, upper])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('high')
  })

  it('keeps the existing user when a later duplicate has a lower score', () => {
    const higher = { admin: true, email: 'user@example.com', id: 'high' }
    const lower = { email: 'USER@EXAMPLE.COM', id: 'low' }

    expect(dedupeUsersByEmail([higher, lower])).toEqual([higher])
  })

  it('prefers admin user over non-admin with same email', () => {
    const plain = { admin: false, email: 'x@example.com', id: 'plain' }
    const adminUser = { admin: true, email: 'x@example.com', id: 'admin' }
    const result = dedupeUsersByEmail([plain, adminUser])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('admin')
  })

  it('prefers user with more roles when admin flag is equal', () => {
    const fewer = { email: 'x@example.com', id: 'fewer', roles: { org1: 'secretary' as const } }
    const more = { email: 'x@example.com', id: 'more', roles: { org1: 'admin' as const, org2: 'secretary' as const } }
    const result = dedupeUsersByEmail([fewer, more])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('more')
  })

  it('prefers user with more officer entries when roles are equal', () => {
    const less = { email: 'x@example.com', id: 'less', officer: ['NOME-A'] }
    const more = { email: 'x@example.com', id: 'more', officer: ['NOME-A', 'NOU'] }
    const result = dedupeUsersByEmail([less, more])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('more')
  })

  it('prefers user with more judge entries when roles and officer are equal', () => {
    const less = { email: 'x@example.com', id: 'less', judge: ['NOME-A'] }
    const more = { email: 'x@example.com', id: 'more', judge: ['NOME-A', 'NOU'] }
    const result = dedupeUsersByEmail([less, more])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('more')
  })

  it('breaks score ties by preferring the more recently modified user', () => {
    const older = { email: 'x@example.com', id: 'older', modifiedAt: '2024-01-01T00:00:00.000Z' }
    const newer = { email: 'x@example.com', id: 'newer', modifiedAt: '2024-06-01T00:00:00.000Z' }
    const result = dedupeUsersByEmail([older, newer])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('newer')
  })

  it('keeps the existing entry when scores and timestamps are tied', () => {
    const first = { email: 'x@example.com', id: 'first', modifiedAt: '2024-01-01T00:00:00.000Z' }
    const second = { email: 'x@example.com', id: 'second', modifiedAt: '2024-01-01T00:00:00.000Z' }
    const result = dedupeUsersByEmail([first, second])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('first')
  })

  it('keeps users without email, each under a unique key', () => {
    const noEmail1 = { email: undefined, id: 'no-email-1' }
    const noEmail2 = { email: undefined, id: 'no-email-2' }
    const withEmail = { email: 'a@example.com', id: 'with-email' }
    const result = dedupeUsersByEmail([noEmail1, noEmail2, withEmail])
    expect(result).toHaveLength(3)
    expect(result.map((u) => u.email)).toContain(undefined)
    expect(result.map((u) => u.email)).toContain('a@example.com')
    expect(result.filter((u) => u.email === undefined)).toHaveLength(2)
  })

  it('handles missing modifiedAt gracefully when comparing timestamps', () => {
    const noDate = { email: 'x@example.com', id: 'no-date' }
    const withDate = { email: 'x@example.com', id: 'with-date', modifiedAt: '2024-01-01T00:00:00.000Z' }
    const result = dedupeUsersByEmail([noDate, withDate])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('with-date')
  })

  it('keeps a dated existing user when the tied candidate has no modifiedAt', () => {
    const withDate = { email: 'x@example.com', id: 'with-date', modifiedAt: '2024-01-01T00:00:00.000Z' }
    const noDate = { email: 'x@example.com', id: 'no-date' }

    expect(dedupeUsersByEmail([withDate, noDate])).toEqual([withDate])
  })

  it('deduplicates multiple groups independently', () => {
    const users = [
      { email: 'a@example.com', id: 'a1', roles: {} },
      { email: 'a@example.com', id: 'a2', roles: { org: 'admin' as const } },
      { email: 'b@example.com', id: 'b1' },
      { email: 'b@example.com', id: 'b2', modifiedAt: '2025-01-01T00:00:00.000Z' },
    ]
    const result = dedupeUsersByEmail(users)
    expect(result).toHaveLength(2)
    expect(result.find((u) => u.email === 'a@example.com')?.id).toBe('a2')
    expect(result.find((u) => u.email === 'b@example.com')?.id).toBe('b2')
  })
})

describe('lib/user', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

  afterEach(() => {
    vi.clearAllMocks()
    mockUserReadAll.mockResolvedValue([])
    mockUserLinkReadAll.mockResolvedValue([])
  })

  describe('filterRelevantUsers', () => {
    it('it should not filter anything for admin', () => {
      expect(filterRelevantUsers(testUsers, admin, [])).toEqual(testUsers)
      expect(filterRelevantUsers(testUsers, admin, ['testOrg'])).toEqual(testUsers)
      expect(filterRelevantUsers(testUsers, admin, ['someOrg'])).toEqual(testUsers)
      expect(filterRelevantUsers(testUsers, admin, ['testOrg', 'otherOrg'])).toEqual(testUsers)
    })
    it('should filter for org admin', () => {
      expect(filterRelevantUsers(testUsers, orgAdmin, ['testOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
        'org admin',
        'org secretary',
      ])
      expect(filterRelevantUsers(testUsers, orgAdmin, ['testOrg', 'otherOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
        'org admin',
        'org secretary',
      ])
      expect(filterRelevantUsers(testUsers, orgAdmin, ['otherOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
      ])
      expect(filterRelevantUsers(testUsers, orgAdmin, ['someOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
      ])
    })
    it('should filter for org secretary', () => {
      expect(filterRelevantUsers(testUsers, orgSecretary, ['testOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
        'org admin',
        'org secretary',
      ])
      expect(filterRelevantUsers(testUsers, orgSecretary, ['otherOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
      ])
      expect(filterRelevantUsers(testUsers, orgSecretary, ['someOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
      ])
    })
    it('should filter for common user', () => {
      expect(filterRelevantUsers(testUsers, justUser, []).map((u) => u.name)).toEqual(['admin', 'judge', 'officer'])
      expect(filterRelevantUsers(testUsers, justUser, ['testOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
      ])
    })
  })

  describe('top-level user API helpers', () => {
    it('getAllUsers returns empty array when db returns undefined', async () => {
      mockUserReadAll.mockResolvedValueOnce(undefined)
      const users = await getAllUsers()
      expect(users).toEqual([])
    })

    it('getAllUsers returns users read from the database', async () => {
      const users = [{ ...defaults, email: 'reader@example.com', id: 'reader', name: 'Reader' }]
      mockUserReadAll.mockResolvedValueOnce(users)

      await expect(getAllUsers()).resolves.toEqual(users)
    })

    it('findUserByEmail returns undefined and warns when called without email', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      await expect(findUserByEmail(undefined)).resolves.toBeUndefined()
      expect(warnSpy).toHaveBeenCalledWith('findUserByEmail called without email')
      warnSpy.mockRestore()
    })

    it('findUserByEmail warns when user not found', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      mockUserQuery.mockResolvedValueOnce([])

      await expect(findUserByEmail('Missing@Example.com ')).resolves.toBeUndefined()

      expect(mockUserQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'gsiEmail',
          key: 'email = :email',
          values: { ':email': 'missing@example.com' },
        })
      )
      expect(warnSpy).toHaveBeenCalledWith('findUserByEmail: user not found')
      warnSpy.mockRestore()
    })

    it('findUserByEmail logs error when active users returned but exact normalized match missing', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mockUserQuery.mockResolvedValueOnce([{ ...defaults, email: 'other@example.com', id: 'u1', name: 'Other' }])

      await expect(findUserByEmail('target@example.com')).resolves.toBeUndefined()

      expect(errorSpy).toHaveBeenCalledWith('findUserByEmail: queried users but none matched normalized email', {
        resultCount: 1,
      })
      errorSpy.mockRestore()
    })

    it('findUserByEmail filters soft-deleted users and returns exact active match', async () => {
      mockUserQuery.mockResolvedValueOnce([
        {
          ...defaults,
          deletedAt: '2024-01-01T00:00:00.000Z',
          email: 'hit@example.com',
          id: 'deleted',
          name: 'Deleted',
        },
        { ...defaults, email: 'hit@example.com', id: 'active', name: 'Active' },
      ])

      await expect(findUserByEmail('Hit@example.com')).resolves.toEqual(
        expect.objectContaining({ email: 'hit@example.com', id: 'active' })
      )
    })

    it('updateUser delegates to write', async () => {
      const user: JsonUser = { ...defaults, email: 'writer@example.com', id: 'write-id', name: 'Writer' }
      mockUserWrite.mockResolvedValueOnce(user)

      await updateUser(user)

      expect(mockUserWrite).toHaveBeenCalledWith(user, 'user-table-not-found-in-env')
    })

    it('setUserRole updates roles and sends access email when role is set', async () => {
      const user: JsonUser = {
        ...defaults,
        email: 'role@example.com',
        id: 'role-user',
        name: 'Role User',
        roles: {},
      }
      mockUserRead.mockResolvedValueOnce({ id: 'org1', name: 'Org One' })

      const result = await setUserRole(user, 'org1', 'admin', 'tester', 'https://app.example.com')

      expect(mockUserUpdate).toHaveBeenCalledWith(
        { id: 'role-user' },
        expect.objectContaining({
          set: expect.objectContaining({
            modifiedBy: 'tester',
            roles: { org1: 'admin' },
          }),
        }),
        'user-table-not-found-in-env'
      )
      expect(mockSendTemplatedMail).toHaveBeenCalledWith(
        'access',
        'fi',
        expect.any(String),
        ['role@example.com'],
        expect.objectContaining({
          admin: true,
          link: 'https://app.example.com/login',
          orgName: 'Org One',
          roleName: 'Yhdistyksen pääkäyttäjä',
          secretary: false,
        })
      )
      expect(result.roles).toEqual({ org1: 'admin' })
    })

    it('setUserRole removes role and does not send email when role is none', async () => {
      const user: JsonUser = {
        ...defaults,
        email: 'role2@example.com',
        id: 'role-user-2',
        name: 'Role User 2',
        roles: { org1: 'secretary', org2: 'admin' },
      }
      mockUserRead.mockResolvedValueOnce({ id: 'org1', name: 'Org One' })

      const result = await setUserRole(user, 'org1', 'none', 'tester')

      expect(mockUserUpdate).toHaveBeenCalled()
      expect(mockSendTemplatedMail).not.toHaveBeenCalled()
      expect(result.roles).toEqual({ org2: 'admin' })
    })

    it('setUserRole uses the unknown-organizer fallback when the organizer is missing', async () => {
      const user: JsonUser = {
        ...defaults,
        email: 'fallback@example.com',
        id: 'fallback-user',
        name: 'Fallback User',
      }
      mockUserRead.mockResolvedValueOnce(undefined)

      await setUserRole(user, 'missing-org', 'secretary', 'tester')

      expect(mockSendTemplatedMail).toHaveBeenCalledWith(
        'access',
        'fi',
        expect.any(String),
        ['fallback@example.com'],
        expect.objectContaining({
          admin: false,
          orgName: 'Tuntematon',
          roleName: 'Koesihteeri',
          secretary: true,
        })
      )
    })
  })

  describe('helper functions', () => {
    it('mergeEventTypes unions and sorts', () => {
      expect(__testables.mergeEventTypes(['B', 'A'], ['A', 'C'])).toEqual(['A', 'B', 'C'])
      expect(__testables.mergeEventTypes(undefined, undefined)).toBeUndefined()
    })

    it('mergeRoles merges objects, right wins on conflict', () => {
      expect(__testables.mergeRoles({ org1: 'admin' }, { org2: 'secretary' })).toEqual({
        org1: 'admin',
        org2: 'secretary',
      })
      expect(__testables.mergeRoles({ org1: 'admin' }, { org1: 'secretary' })).toEqual({ org1: 'secretary' })
      expect(__testables.mergeRoles(undefined, undefined)).toBeUndefined()
    })

    it('mergeUsersByKcId merges into canonical and clears duplicates', () => {
      const now = '2024-05-30T20:00:00.000Z'
      const a: JsonUser = { ...defaults, email: 'a@example.com', id: 'a', kcId: 1, name: 'A', officer: ['X'] }
      const b: JsonUser = { ...defaults, email: 'b@example.com', id: 'b', kcId: 1, name: 'B', roles: { org: 'admin' } }
      const writes = __testables.mergeUsersByKcId(1, [a, b], now)

      expect(writes).toHaveLength(2)
      const canonical = writes.find((u) => u.id === 'b')
      const cleared = writes.find((u) => u.id === 'a')
      expect(canonical).toEqual(
        expect.objectContaining({
          kcId: 1,
          modifiedAt: now,
          modifiedBy: 'system',
          officer: ['X'],
          roles: { org: 'admin' },
        })
      )
      expect(cleared).toEqual(
        expect.objectContaining({
          deletedAt: now,
          id: 'a',
          modifiedAt: now,
          modifiedBy: 'system',
        })
      )
    })

    it('mergeUsersByKcId merges and truncates deduplicated emailHistory to latest 10', () => {
      const now = '2024-05-30T20:00:00.000Z'
      const many = Array.from({ length: 12 }).map((_, i) => ({
        changedAt: `2024-05-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        email: `e${i}@example.com`,
        source: 'kl' as const,
      }))

      const a: JsonUser = {
        ...defaults,
        email: 'a@example.com',
        emailHistory: [many[0], many[1], many[2], many[2]],
        id: 'a',
        kcId: 1,
        name: 'A',
      }
      const b: JsonUser = {
        ...defaults,
        email: 'b@example.com',
        emailHistory: many,
        id: 'b',
        kcId: 1,
        name: 'B',
        roles: { org: 'admin' },
      }

      const writes = __testables.mergeUsersByKcId(1, [a, b], now)
      const canonical = writes.find((u) => u.id === 'b')

      expect(canonical?.emailHistory).toHaveLength(10)
      expect(canonical?.emailHistory?.[0].email).toBe('e2@example.com')
      expect(canonical?.emailHistory?.[9].email).toBe('e11@example.com')
    })

    it('mergeUsersByKcId returns empty when only one user is provided', () => {
      const one: JsonUser = { ...defaults, email: 'only@example.com', id: 'only', kcId: 42, name: 'Only User' }
      expect(__testables.mergeUsersByKcId(42, [one], '2024-05-30T20:00:00.000Z')).toEqual([])
    })

    it('toEventUser maps JsonUser to a compact event user shape', () => {
      const u: JsonUser = {
        ...defaults,
        email: 'e@example.com',
        id: 'id1',
        kcId: 123,
        location: 'l',
        name: 'Name',
        phone: 'p',
      }
      expect(__testables.toEventUser(u, { id: 'fallback' })).toEqual({
        email: 'e@example.com',
        id: 'id1',
        kcId: 123,
        location: 'l',
        name: 'Name',
        phone: 'p',
      })
      expect(__testables.toEventUser(undefined, { id: 'fallback', name: 'F' })).toEqual({ id: 'fallback', name: 'F' })
      expect(__testables.toEventUser(undefined, undefined)).toEqual({})
    })
  })

  describe('updateUsersFromOfficialsOrJudges', () => {
    const mockReadAll = vi.fn<CustomDynamoClient['readAll']>().mockResolvedValue([])
    let batchWriteArguments: Parameters<CustomDynamoClient['batchWrite']> | undefined
    const mockBatchWrite = vi.fn<CustomDynamoClient['batchWrite']>((...args) => {
      batchWriteArguments = args
      return Promise.resolve(undefined)
    })
    // The sync touches only these two members; the partial double converts at this boundary.
    const mockDB = {
      batchWrite: mockBatchWrite,
      readAll: mockReadAll,
    } as unknown as CustomDynamoClient

    it('loadSyncContext falls back to empty users and links when reads return undefined', async () => {
      mockReadAll.mockResolvedValueOnce(undefined)
      mockUserLinkReadAll.mockResolvedValueOnce(undefined)

      await expect(__testables.loadSyncContext(mockDB, [])).resolves.toEqual({
        allUsers: [],
        dateString: '2024-05-30T20:00:00.000Z',
        itemsWithEmail: [],
        linkedUserIds: new Set(),
      })
    })

    it('should do nothing with empty judges array', async () => {
      await updateUsersFromOfficialsOrJudges(mockDB, [], 'judge')

      expect(mockReadAll).not.toHaveBeenCalled()
      expect(mockBatchWrite).not.toHaveBeenCalled()
    })

    it('should add user from official', async () => {
      const added1: Official = {
        district: 'other district',
        email: 'other@example.com',
        eventTypes: ['NOME-A'],
        id: 222,
        name: 'surname firstname',
      }
      const added2: Official = {
        district: 'some district',
        email: 'dredd@example.com',
        eventTypes: ['NOME-A', 'NOU'],
        id: 333,
        location: 'location',
        name: 'dredd official',
        phone: 'phone',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [added1, added2], 'officer')

      expect(mockReadAll).toHaveBeenCalledWith({ table: 'user-table-not-found-in-env' })
      expect(mockReadAll).toHaveBeenCalledTimes(1)
      const written = batchWriteArguments?.[0] as JsonUser[]
      expect(written).toHaveLength(2)
      expect(written.map((u) => u.kcId).sort()).toEqual([222, 333])
      expect(written.find((u) => u.kcId === 222)).toEqual(
        expect.objectContaining({
          email: 'other@example.com',
          id: expect.stringMatching(/^test-id-/),
          kcEmail: 'other@example.com',
          name: 'firstname surname',
          officer: ['NOME-A'],
        })
      )
      expect(written.find((u) => u.kcId === 333)).toEqual(
        expect.objectContaining({
          email: 'dredd@example.com',
          id: expect.stringMatching(/^test-id-/),
          kcEmail: 'dredd@example.com',
          location: 'location',
          name: 'official dredd',
          officer: ['NOME-A', 'NOU'],
          phone: 'phone',
        })
      )
      expect(batchWriteArguments?.[1]).toBe('user-table-not-found-in-env')
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith('creating user from official directory', { sourceId: 222 })
    })

    it('should update user from official', async () => {
      const existing: JsonUser = {
        createdAt: '2024-05-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'old@example.com',
        emailHistory: [],
        id: 'test-id',
        kcId: 333,
        location: 'location',
        modifiedAt: '2024-05-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'official dredd',
        officer: ['NOME-A', 'NOU'],
        phone: 'phone',
      }

      mockReadAll.mockResolvedValueOnce([existing])

      const official: Official = {
        district: 'other district',
        email: 'dredd@example.com',
        eventTypes: ['NOME-A'],
        id: 333,
        name: 'dredd official',
        phone: 'new phone',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [official], 'officer')

      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            createdAt: '2024-05-30T20:00:00.000Z',
            createdBy: 'system',
            email: 'dredd@example.com',
            emailHistory: [{ changedAt: '2024-05-30T20:00:00.000Z', email: 'old@example.com', source: 'kl' }],
            id: 'test-id',
            kcEmail: 'dredd@example.com',
            kcId: 333,
            location: 'location',
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'official dredd',
            officer: ['NOME-A'],
            phone: 'new phone',
          },
        ],
        'user-table-not-found-in-env'
      )
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith('updating user from official directory', {
        changedKeys: ['email', 'emailHistory', 'officer', 'phone', 'kcEmail'],
        userId: 'test-id',
      })
    })

    it('should preserve email for linked user while updating other fields', async () => {
      const existing: JsonUser = {
        createdAt: '2024-05-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'old@example.com',
        emailHistory: [],
        id: 'test-id',
        kcId: 333,
        location: 'location',
        modifiedAt: '2024-05-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'official dredd',
        officer: ['NOME-A', 'NOU'],
        phone: 'phone',
      }

      mockReadAll.mockResolvedValueOnce([existing])
      mockUserLinkReadAll.mockResolvedValueOnce([{ cognitoUser: 'sub-1', userId: 'test-id' }])

      const official: Official = {
        district: 'other district',
        email: 'dredd@example.com',
        eventTypes: ['NOME-A'],
        id: 333,
        name: 'dredd official',
        phone: 'new phone',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [official], 'officer')

      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            createdAt: '2024-05-30T20:00:00.000Z',
            createdBy: 'system',
            email: 'old@example.com',
            emailHistory: [],
            id: 'test-id',
            kcEmail: 'dredd@example.com',
            kcId: 333,
            location: 'location',
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'official dredd',
            officer: ['NOME-A'],
            phone: 'new phone',
          },
        ],
        'user-table-not-found-in-env'
      )
      expect(logSpy).toHaveBeenCalledWith('updating user from official directory', {
        changedKeys: ['officer', 'phone', 'kcEmail'],
        userId: 'test-id',
      })
    })

    it('should add user from judge', async () => {
      const added1: PartialJsonJudge = {
        district: 'other district',
        email: 'other@example.com',
        eventTypes: ['NOME-A'],
        id: 222,
        name: 'surname firstname',
      }
      const added2: PartialJsonJudge = {
        district: 'some district',
        email: 'dredd@example.com',
        eventTypes: ['NOME-A', 'NOU'],
        id: 333,
        location: 'location',
        name: 'dredd judge',
        phone: 'phone',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [added1, added2], 'judge')

      expect(mockReadAll).toHaveBeenCalledWith({ table: 'user-table-not-found-in-env' })
      expect(mockReadAll).toHaveBeenCalledTimes(1)
      const written = batchWriteArguments?.[0] as JsonUser[]
      expect(written).toHaveLength(2)
      expect(written.map((u) => u.kcId).sort()).toEqual([222, 333])
      expect(written.find((u) => u.kcId === 222)).toEqual(
        expect.objectContaining({
          email: 'other@example.com',
          id: expect.stringMatching(/^test-id-/),
          judge: ['NOME-A'],
          kcEmail: 'other@example.com',
          name: 'firstname surname',
        })
      )
      expect(written.find((u) => u.kcId === 333)).toEqual(
        expect.objectContaining({
          email: 'dredd@example.com',
          id: expect.stringMatching(/^test-id-/),

          judge: ['NOME-A', 'NOU'],
          kcEmail: 'dredd@example.com',
          location: 'location',
          name: 'judge dredd',
          phone: 'phone',
        })
      )
      expect(batchWriteArguments?.[1]).toBe('user-table-not-found-in-env')
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith('creating user from official directory', { sourceId: 222 })
    })

    it('should update user from judge', async () => {
      const existing: JsonUser = {
        createdAt: '2024-05-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'Dredd@Example.Com',
        id: 'test-id',
        judge: ['NOME-A', 'NOU'],
        kcId: 333,
        location: 'location',
        modifiedAt: '2024-05-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'judge dredd',
        phone: 'phone',
      }

      mockReadAll.mockResolvedValueOnce([existing])

      const judge: PartialJsonJudge = {
        district: 'other district',
        email: 'dredd@example.com',
        eventTypes: ['NOME-A'],
        id: 333,
        name: 'dredd judge',
        phone: 'new phone',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [judge], 'judge')

      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            createdAt: '2024-05-30T20:00:00.000Z',
            createdBy: 'system',
            email: 'dredd@example.com',
            id: 'test-id',
            judge: ['NOME-A'],
            kcEmail: 'dredd@example.com',
            kcId: 333,
            location: 'location',
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'judge dredd',
            phone: 'new phone',
          },
        ],
        'user-table-not-found-in-env'
      )
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith('updating user from official directory', {
        changedKeys: ['email', 'judge', 'phone', 'kcEmail'],
        userId: 'test-id',
      })
    })

    it('merges duplicate users by kcId when the event scan returns undefined', async () => {
      const canonical: JsonUser = {
        ...defaults,
        email: 'old@example.com',
        id: 'canon',
        kcId: 777,
        name: 'Official Person',
        officer: ['NOME-A'],
      }
      const dupe: JsonUser = {
        ...defaults,
        email: 'new@example.com',
        id: 'dupe',
        kcId: 777,
        name: 'Official Person',
        officer: ['NOU'],
        roles: { testOrg: 'admin' },
      }

      mockReadAll.mockResolvedValueOnce([canonical, dupe])

      mockEventReadAll.mockResolvedValueOnce(undefined)

      const fromKl: Official = {
        district: 'district',
        email: 'Newest@Example.com',
        eventTypes: ['NOME-A'],
        id: 777,
        name: 'person official',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [fromKl], 'officer')

      // Users are written back: canonical merged + updated, dupe cleared.
      const writeItems = batchWriteArguments?.[0] as JsonUser[]
      // Canonical selection is based on scoring (roles/admin/officer/judge/etc),
      // so don't hardcode which of the two becomes canonical.
      const writtenCanonical = writeItems.find((u) => u.id === 'dupe')
      const writtenOther = writeItems.find((u) => u.kcId === 777 && u.id !== writtenCanonical?.id)

      expect(writtenCanonical).toBeDefined()
      expect(writtenCanonical?.kcId).toBe(777)
      expect(writtenCanonical?.email).toBe('newest@example.com')
      // Officer list is set from KL item eventTypes (current truth), not union of old values.
      expect((writtenCanonical?.officer ?? []).sort()).toEqual(['NOME-A'])
      // Role from the original dupe record should be retained on canonical.
      expect(writtenCanonical?.roles).toEqual({ testOrg: 'admin' })

      expect(writtenOther).toBeDefined()
      // Duplicates are kept for traceability, and marked deleted.
      expect(writtenOther?.deletedAt).toBeDefined()

      // Canonical merge + upsert happened for duplicates.
      // Event remap behavior is covered in dedicated event-reference tests below.
    })

    it('does not match incoming item to soft-deleted user by email', async () => {
      const deletedExisting: JsonUser = {
        ...defaults,
        deletedAt: '2024-01-01T00:00:00.000Z',
        email: 'same@example.com',
        id: 'deleted-1',
        name: 'Deleted User',
      }

      mockReadAll.mockResolvedValueOnce([deletedExisting])

      const fromKl: Official = {
        district: 'district',
        email: 'same@example.com',
        eventTypes: ['NOME-A'],
        id: 999,
        name: 'user same',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [fromKl], 'officer')

      const writeItems = batchWriteArguments?.[0] as JsonUser[]
      expect(writeItems).toHaveLength(1)
      expect(writeItems[0]).toEqual(
        expect.objectContaining({
          email: 'same@example.com',
          id: expect.stringMatching(/^test-id-/),
          kcEmail: 'same@example.com',
          kcId: 999,
          name: 'same user',
          officer: ['NOME-A'],
        })
      )
      expect(writeItems[0].id).not.toBe('deleted-1')
    })

    it('does not write when matched user has no effective changes', async () => {
      const existing: JsonUser = {
        ...defaults,
        email: 'dredd@example.com',
        id: 'same-user',
        kcEmail: 'dredd@example.com',
        kcId: 333,
        location: 'location',
        name: 'official dredd',
        officer: ['NOME-A'],
        phone: 'phone',
      }

      mockReadAll.mockResolvedValueOnce([existing])

      const official: Official = {
        district: 'district',
        email: 'dredd@example.com',
        eventTypes: ['NOME-A'],
        id: 333,
        location: 'location',
        name: 'dredd official',
        phone: 'phone',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [official], 'officer')

      expect(mockBatchWrite).not.toHaveBeenCalled()
    })

    it('matches existing user by email when kcId is missing', async () => {
      const existing: JsonUser = {
        ...defaults,
        email: 'dredd@example.com',
        id: 'by-email',
        kcEmail: 'dredd@example.com',
        name: 'official dredd',
        officer: ['NOME-A'],
        phone: 'old phone',
      }

      mockReadAll.mockResolvedValueOnce([existing])

      const official: Official = {
        district: 'district',
        email: 'dredd@example.com',
        eventTypes: ['NOME-A'],
        id: 333,
        name: 'dredd official',
        phone: 'new phone',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [official], 'officer')

      const writeItems = batchWriteArguments?.[0] as JsonUser[]
      expect(writeItems).toHaveLength(1)
      expect(writeItems[0].id).toBe('by-email')
      expect(writeItems[0].kcId).toBe(333)
      expect(writeItems[0].phone).toBe('new phone')
    })

    it('updates event official and preserves/remaps secretary consistently', async () => {
      const canonical: JsonUser = {
        ...defaults,
        email: 'canon@example.com',
        id: 'canon',
        kcId: 888,
        name: 'Official Person',
      }
      const dupe: JsonUser = {
        ...defaults,
        email: 'dupe@example.com',
        id: 'dupe',
        kcId: 888,
        name: 'Official Person',
        roles: { testOrg: 'admin' },
      }

      mockReadAll.mockResolvedValueOnce([canonical, dupe])
      mockEventReadAll.mockResolvedValueOnce([
        {
          classes: [],
          cost: 0,
          createdAt: defaults.createdAt,
          createdBy: defaults.createdBy,
          description: '',
          endDate: '2024-06-01T00:00:00.000Z',
          eventType: 'NOME-A',
          id: 'evt-2',
          judges: [],
          location: 'loc',
          modifiedAt: defaults.modifiedAt,
          modifiedBy: defaults.modifiedBy,
          name: 'evt2',
          official: { id: 'canon', name: 'Official Person' },
          organizer: { id: 'org', name: 'org' },
          places: 0,
          secretary: { id: 'canon', name: 'Official Person' },
          startDate: '2024-06-01T00:00:00.000Z',
          state: 'draft',
        },
        {
          classes: [],
          cost: 0,
          createdAt: defaults.createdAt,
          createdBy: defaults.createdBy,
          description: '',
          endDate: '2024-06-01T00:00:00.000Z',
          eventType: 'NOME-A',
          id: 'evt-unrelated',
          judges: [],
          location: 'loc',
          modifiedAt: defaults.modifiedAt,
          modifiedBy: defaults.modifiedBy,
          name: 'unrelated event',
          official: { id: 'unrelated-user', name: 'Unrelated User' },
          organizer: { id: 'org', name: 'org' },
          places: 0,
          startDate: '2024-06-01T00:00:00.000Z',
          state: 'draft',
        },
      ])

      const fromKl: Official = {
        district: 'district',
        email: 'latest@example.com',
        eventTypes: ['NOME-A'],
        id: 888,
        name: 'person official',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [fromKl], 'officer')

      expect(mockEventUpdate).toHaveBeenCalledTimes(1)
      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          set: expect.objectContaining({
            official: expect.objectContaining({ id: expect.any(String) }),
            secretary: expect.objectContaining({ id: expect.any(String), name: 'Official Person' }),
          }),
        }),
        expect.any(String)
      )
    })

    it('updates event official and keeps secretary as-is when no secretary mapping exists', async () => {
      const canonical: JsonUser = {
        ...defaults,
        email: 'canon@example.com',
        id: 'canon',
        kcId: 888,
        name: 'Official Person',
      }
      const dupe: JsonUser = {
        ...defaults,
        email: 'dupe@example.com',
        id: 'dupe',
        kcId: 888,
        name: 'Official Person',
        roles: { testOrg: 'admin' },
      }

      mockReadAll.mockResolvedValueOnce([canonical, dupe])
      mockEventReadAll.mockResolvedValueOnce([
        {
          classes: [],
          cost: 0,
          createdAt: defaults.createdAt,
          createdBy: defaults.createdBy,
          description: '',
          endDate: '2024-06-01T00:00:00.000Z',
          eventType: 'NOME-A',
          id: 'evt-official-only',
          judges: [],
          location: 'loc',
          modifiedAt: defaults.modifiedAt,
          modifiedBy: defaults.modifiedBy,
          name: 'evt official only',
          official: { id: 'canon', name: 'Official Person' },
          organizer: { id: 'org', name: 'org' },
          places: 0,
          startDate: '2024-06-01T00:00:00.000Z',
          state: 'draft',
        },
      ])

      const fromKl: Official = {
        district: 'district',
        email: 'latest@example.com',
        eventTypes: ['NOME-A'],
        id: 888,
        name: 'person official',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [fromKl], 'officer')

      expect(mockEventUpdate).toHaveBeenCalledTimes(1)
      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          set: expect.objectContaining({
            official: expect.objectContaining({ id: 'dupe', name: 'Official Person' }),
            secretary: undefined,
          }),
        }),
        expect.any(String)
      )
    })

    it('remaps a duplicate secretary when the event has no official', async () => {
      const canonical: JsonUser = {
        ...defaults,
        admin: true,
        email: 'canon-sec@example.com',
        id: 'canon-sec',
        kcId: 990,
        name: 'Secretary Person',
      }
      const dupe: JsonUser = {
        ...defaults,
        email: 'dupe-sec@example.com',
        id: 'dupe-sec',
        kcId: 990,
        name: 'Secretary Person',
      }

      mockReadAll.mockResolvedValueOnce([canonical, dupe])
      mockUserLinkReadAll.mockResolvedValueOnce([{ cognitoUser: 'sub-canon-sec', userId: 'canon-sec' }])
      mockEventReadAll.mockResolvedValueOnce([
        {
          classes: [],
          cost: 0,
          createdAt: defaults.createdAt,
          createdBy: defaults.createdBy,
          description: '',
          endDate: '2024-06-01T00:00:00.000Z',
          eventType: 'NOME-A',
          id: 'evt-secretary-only',
          judges: [],
          location: 'loc',
          modifiedAt: defaults.modifiedAt,
          modifiedBy: defaults.modifiedBy,
          name: 'evt secretary only',
          organizer: { id: 'org', name: 'org' },
          places: 0,
          secretary: { id: 'dupe-sec', name: 'Secretary Person' },
          startDate: '2024-06-01T00:00:00.000Z',
          state: 'draft',
        },
      ])

      const fromKl: Official = {
        district: 'district',
        email: 'latest-sec@example.com',
        eventTypes: ['NOME-A'],
        id: 990,
        name: 'person secretary',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [fromKl], 'officer')

      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockEventUpdate).toHaveBeenCalledWith(
        { id: 'evt-secretary-only' },
        expect.objectContaining({
          set: expect.objectContaining({
            official: undefined,
            secretary: expect.objectContaining({ id: 'canon-sec', name: 'Secretary Person' }),
          }),
        }),
        'event-table-not-found-in-env'
      )
    })

    it('logs and rethrows when batch write fails', async () => {
      const added: Official = {
        district: 'district',
        email: 'failing@example.com',
        eventTypes: ['NOME-A'],
        id: 111,
        name: 'surname firstname',
      }
      const err = new Error('batch write failed')
      mockBatchWrite.mockRejectedValueOnce(err)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      await expect(updateUsersFromOfficialsOrJudges(mockDB, [added], 'officer')).rejects.toThrow('batch write failed')

      expect(errorSpy).toHaveBeenCalledWith('Failed to batch write user sync', { userCount: 1 })

      errorSpy.mockRestore()
    })

    it('skips invalid new item email while still updating valid matched existing by kcId', async () => {
      const existing: JsonUser = {
        ...defaults,
        email: 'existing@example.com',
        id: 'existing-1',
        kcEmail: 'existing@example.com',
        kcId: 444,
        name: 'existing user',
        officer: ['NOME-A'],
      }

      mockReadAll.mockResolvedValueOnce([existing])

      const invalidNew: Official = {
        district: 'district',
        email: 'not-an-email',
        eventTypes: ['NOME-A'],
        id: 555,
        name: 'invalid new',
      }
      const validExistingMatch: Official = {
        district: 'district',
        email: 'existing@example.com',
        eventTypes: ['NOME-B'],
        id: 444,
        name: 'updated existing',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [invalidNew, validExistingMatch], 'officer')

      const writeItems = batchWriteArguments?.[0] as JsonUser[]
      expect(writeItems).toHaveLength(1)
      expect(writeItems[0]).toEqual(
        expect.objectContaining({
          id: 'existing-1',
          kcId: 444,
          name: 'existing updated',
          officer: ['NOME-B'],
        })
      )
      expect(logSpy).not.toHaveBeenCalledWith('skipping item due to invalid email: invalid new, email: not-an-email')
    })

    it('triggers canonical-id path compression through updateUsersFromOfficialsOrJudges with inconsistent duplicate ids', async () => {
      // Intentionally inconsistent fixture: same user id appears under two different kcIds.
      // This can create a chain A -> B and B -> C, which should be compressed to A -> C.
      const kc1Dupe: JsonUser = {
        ...defaults,
        email: 'a@example.com',
        id: 'A',
        kcId: 1001,
        name: 'User A',
      }
      const kc1Canonical: JsonUser = {
        ...defaults,
        email: 'b@example.com',
        id: 'B',
        kcId: 1001,
        name: 'User B canonical for kc1',
        roles: { org1: 'admin' },
      }
      const kc2DupeSameIdAsKc1Canonical: JsonUser = {
        ...defaults,
        email: 'b2@example.com',
        id: 'B',
        kcId: 2002,
        name: 'User B duplicate for kc2',
      }
      const kc2Canonical: JsonUser = {
        ...defaults,
        email: 'c@example.com',
        id: 'C',
        kcId: 2002,
        name: 'User C canonical for kc2',
        roles: { org2: 'admin' },
      }

      mockReadAll.mockResolvedValueOnce([kc1Dupe, kc1Canonical, kc2DupeSameIdAsKc1Canonical, kc2Canonical])
      mockEventReadAll.mockResolvedValueOnce([
        {
          classes: [],
          cost: 0,
          createdAt: defaults.createdAt,
          createdBy: defaults.createdBy,
          description: '',
          endDate: '2024-06-01T00:00:00.000Z',
          eventType: 'NOME-A',
          id: 'evt-path-compress',
          judges: [],
          location: 'loc',
          modifiedAt: defaults.modifiedAt,
          modifiedBy: defaults.modifiedBy,
          name: 'evt-path-compress',
          official: { id: 'A', name: 'Old Official A' },
          organizer: { id: 'org', name: 'org' },
          places: 0,
          startDate: '2024-06-01T00:00:00.000Z',
          state: 'draft',
        },
      ])

      const fromKl: Official = {
        district: 'district',
        email: 'b@example.com',
        eventTypes: ['NOME-A'],
        id: 1001,
        name: 'user b canonical for kc1',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [fromKl], 'officer')

      // The A -> B -> C chain is compressed before event references are rewritten.
      expect(mockBatchWrite).toHaveBeenCalled()
      expect(mockEventUpdate).toHaveBeenCalledWith(
        { id: 'evt-path-compress' },
        expect.objectContaining({
          set: expect.objectContaining({ official: expect.objectContaining({ id: 'C' }) }),
        }),
        'event-table-not-found-in-env'
      )
    })
  })
})

const scopedUser = (props: Partial<JsonUser>): JsonUser => ({
  createdAt: '',
  createdBy: '',
  email: '',
  id: '',
  modifiedAt: '',
  modifiedBy: '',
  name: '',
  ...props,
})

describe('userScopes', () => {
  it('puts every record in the global scope', () => {
    expect(userScopes(scopedUser({}))).toEqual([GLOBAL_SCOPE])
  })

  it('puts admins, judges and officials in the directory scope', () => {
    expect(userScopes(scopedUser({ admin: true }))).toContain(DIRECTORY_SCOPE)
    expect(userScopes(scopedUser({ judge: ['NOME-B'] }))).toContain(DIRECTORY_SCOPE)
    expect(userScopes(scopedUser({ officer: ['NOME-B'] }))).toContain(DIRECTORY_SCOPE)
    expect(userScopes(scopedUser({ judge: [], officer: [] }))).not.toContain(DIRECTORY_SCOPE)
  })

  it('puts a record in the scope of every organization it has a role in', () => {
    expect(userScopes(scopedUser({ roles: { org1: 'secretary', org2: 'admin' } }))).toEqual([
      GLOBAL_SCOPE,
      'org1',
      'org2',
    ])
  })
})

describe('callerScopes', () => {
  it('reads the global scope for a global admin', () => {
    expect(callerScopes(scopedUser({ admin: true, roles: { org1: 'secretary' } }))).toEqual([GLOBAL_SCOPE])
  })

  it('reads the directory and the caller organizations', () => {
    expect(callerScopes(scopedUser({ roles: { org1: 'secretary', org2: 'admin' } }))).toEqual([
      DIRECTORY_SCOPE,
      'org1',
      'org2',
    ])
  })

  it('ignores organizations the caller is not a member of', () => {
    expect(callerScopes(scopedUser({ roles: { org1: 'secretary' } }), ['org1', 'other'])).toEqual([
      DIRECTORY_SCOPE,
      'org1',
    ])
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
    scopedUser({ id: 'plain' }),
    scopedUser({ admin: true, id: 'admin' }),
    scopedUser({ id: 'judge', judge: ['NOME-B'] }),
    scopedUser({ id: 'officer', officer: ['NOME-B'] }),
    scopedUser({ id: 'org1-secretary', roles: { org1: 'secretary' } }),
    scopedUser({ id: 'org2-secretary', roles: { org2: 'secretary' } }),
    scopedUser({ id: 'both', roles: { org1: 'admin', org2: 'secretary' } }),
  ]

  const callers = [
    scopedUser({ admin: true, id: 'global-admin' }),
    scopedUser({ id: 'org1-caller', roles: { org1: 'secretary' } }),
    scopedUser({ id: 'org2-caller', roles: { org2: 'admin' } }),
    scopedUser({ id: 'no-org-caller' }),
  ]

  it.each(callers.map((caller) => [caller.id, caller] as const))('holds for %s', (_id, caller) => {
    const orgs = Object.keys(caller.roles ?? {})
    const relevant = filterRelevantUsers(records, caller, orgs)
    const scopes = new Set(callerScopes(caller, orgs))

    for (const record of records) {
      const intersects = userScopes(record).some((scope: string) => scopes.has(scope))
      expect({ id: record.id, intersects }).toEqual({ id: record.id, intersects: isRelevant(record, caller, orgs) })
      expect(relevant.includes(record)).toBe(intersects)
    }
  })
})
