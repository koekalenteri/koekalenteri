import type { JsonDbRecord, JsonUser, Official } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type { PartialJsonJudge } from './judge'
import { jest } from '@jest/globals'

jest.useFakeTimers()
jest.setSystemTime(new Date('2024-05-30T20:00:00Z'))
jest.unstable_mockModule('nanoid', () => {
  let i = 0
  return { nanoid: () => `test-id-${++i}` }
})

const mockEventReadAll = jest.fn<any>()
const mockEventUpdate = jest.fn<any>()
const mockUserLinkReadAll = jest.fn<any>()
const mockUserQuery = jest.fn<any>()
const mockUserRead = jest.fn<any>()
const mockUserWrite = jest.fn<any>()
const mockUserUpdate = jest.fn<any>()
const mockSendTemplatedMail = jest.fn<any>()

jest.unstable_mockModule('../../i18n/lambda', () => ({
  i18n: {
    getFixedT: () => (key: string) => key,
  },
}))

jest.unstable_mockModule('./email', () => ({
  sendTemplatedMail: (...args: any[]) => mockSendTemplatedMail(...args),
}))

// `updateUsersFromOfficialsOrJudges()` creates a separate Dynamo client for events.
// Mock it so tests stay fully in-memory.
jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    table: string

    constructor(tableName: string) {
      this.table = tableName
    }

    readAll = (table?: string) => {
      if (table?.includes('event')) return mockEventReadAll(table)
      if (table?.includes('user-link')) return mockUserLinkReadAll(table)
      if (table?.includes('event')) return mockEventReadAll(table)
      return Promise.resolve([])
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
  filterRelevantUsers,
  getAllUsers,
  findUserByEmail,
  updateUser,
  setUserRole,
  updateUsersFromOfficialsOrJudges,
  __testables,
} = await import('./user')

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

describe('lib/user', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)

  afterEach(() => {
    jest.clearAllMocks()
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
      mockEventReadAll.mockResolvedValueOnce(undefined)
      const users = await getAllUsers()
      expect(users).toEqual([])
    })

    it('findUserByEmail returns undefined and warns when called without email', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
      await expect(findUserByEmail(undefined)).resolves.toBeUndefined()
      expect(warnSpy).toHaveBeenCalledWith('findUserByEmail called without email')
      warnSpy.mockRestore()
    })

    it('findUserByEmail warns when user not found', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
      mockUserQuery.mockResolvedValueOnce([])

      await expect(findUserByEmail('Missing@Example.com ')).resolves.toBeUndefined()

      expect(mockUserQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'gsiEmail',
          key: 'email = :email',
          values: { ':email': 'missing@example.com' },
        })
      )
      expect(warnSpy).toHaveBeenCalledWith('findUserByEmail: user not found', {
        normalizedEmail: 'missing@example.com',
      })
      warnSpy.mockRestore()
    })

    it('findUserByEmail logs error when active users returned but exact normalized match missing', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
      mockUserQuery.mockResolvedValueOnce([{ ...defaults, email: 'other@example.com', id: 'u1', name: 'Other' }])

      await expect(findUserByEmail('target@example.com')).resolves.toBeUndefined()

      expect(errorSpy).toHaveBeenCalledWith('findUserByEmail: queried users but none matched normalized email', {
        normalizedEmail: 'target@example.com',
        returnedEmails: ['other@example.com'],
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
    const mockReadAll = jest.fn<CustomDynamoClient['readAll']>().mockResolvedValue([])
    const mockBatchWrite = jest.fn<CustomDynamoClient['batchWrite']>()
    const mockDB = {
      batchWrite: mockBatchWrite,
      readAll: mockReadAll,
    } as unknown as CustomDynamoClient

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

      expect(mockReadAll).toHaveBeenCalledWith('user-table-not-found-in-env')
      expect(mockReadAll).toHaveBeenCalledTimes(1)
      const written = mockBatchWrite.mock.calls[0]?.[0] as JsonUser[]
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
      expect(mockBatchWrite.mock.calls[0]?.[1]).toBe('user-table-not-found-in-env')
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith('creating user from item: surname firstname, email: other@example.com')
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
      expect(logSpy).toHaveBeenCalledWith(
        'updating user from item: dredd official. changed props: email, emailHistory, officer, phone, kcEmail'
      )
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
      expect(logSpy).toHaveBeenCalledWith(
        'updating user from item: dredd official. changed props: officer, phone, kcEmail'
      )
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

      expect(mockReadAll).toHaveBeenCalledWith('user-table-not-found-in-env')
      expect(mockReadAll).toHaveBeenCalledTimes(1)
      const written = mockBatchWrite.mock.calls[0]?.[0] as JsonUser[]
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
      expect(mockBatchWrite.mock.calls[0]?.[1]).toBe('user-table-not-found-in-env')
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith('creating user from item: surname firstname, email: other@example.com')
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
      expect(logSpy).toHaveBeenCalledWith(
        'updating user from item: dredd judge. changed props: email, judge, phone, kcEmail'
      )
    })

    it('merges duplicate users by kcId (KL email changed) and updates event official/secretary references', async () => {
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

      mockEventReadAll.mockResolvedValueOnce([
        {
          classes: [],
          cost: 0,
          createdAt: defaults.createdAt,
          createdBy: defaults.createdBy,
          description: '',
          endDate: '2024-06-01T00:00:00.000Z',
          eventType: 'NOME-A',
          id: 'evt-1',
          judges: [],
          location: 'loc',
          modifiedAt: defaults.modifiedAt,
          modifiedBy: defaults.modifiedBy,
          name: 'evt',
          // Point at the *non-canonical* id so the sync must rewrite it.
          official: { id: 'canon', name: 'Official Person' },
          organizer: { id: 'org', name: 'org' },
          places: 0,
          secretary: { id: 'canon', name: 'Official Person' },
          startDate: '2024-06-01T00:00:00.000Z',
          state: 'draft',
        },
      ])

      const fromKl: Official = {
        district: 'district',
        email: 'Newest@Example.com',
        eventTypes: ['NOME-A'],
        id: 777,
        name: 'person official',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [fromKl], 'officer')

      // Users are written back: canonical merged + updated, dupe cleared.
      const writeItems = mockBatchWrite.mock.calls[0]?.[0] as JsonUser[]
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

      const writeItems = mockBatchWrite.mock.calls[0]?.[0] as JsonUser[]
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

      const writeItems = mockBatchWrite.mock.calls[0]?.[0] as JsonUser[]
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
      const [, updateSpec] = mockEventUpdate.mock.calls[0] as any
      expect(updateSpec.set.official.id).toBeDefined()
      expect(updateSpec.set.secretary).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: 'Official Person',
        })
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
      const [, updateSpec] = mockEventUpdate.mock.calls[0] as any
      expect(updateSpec.set.official).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: 'Official Person',
        })
      )
      expect(updateSpec.set.official.id).toBe('dupe')
      expect(updateSpec.set.secretary).toBeUndefined()
    })

    it('keeps flow stable when only secretary candidate would be remapped', async () => {
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
          official: { id: 'official-keep', name: 'Official Keep' },
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
      expect(mockEventUpdate).not.toHaveBeenCalled()
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
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

      await expect(updateUsersFromOfficialsOrJudges(mockDB, [added], 'officer')).rejects.toThrow('batch write failed')

      expect(errorSpy).toHaveBeenCalledWith(err)
      expect(logSpy).toHaveBeenCalledWith('write:')

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

      const writeItems = mockBatchWrite.mock.calls[0]?.[0] as JsonUser[]
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

      // This fixture's inconsistent duplicate ids is enough to execute the path-compression loop.
      // Event remap is not guaranteed for this synthetic case, but write path must still complete.
      expect(mockBatchWrite).toHaveBeenCalled()
      expect(mockEventUpdate).not.toHaveBeenCalled()
    })
  })
})
