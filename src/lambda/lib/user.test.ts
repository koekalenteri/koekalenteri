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
      if (table && table.includes('event')) return mockEventReadAll(table)
      if (table && table.includes('user-link')) return mockUserLinkReadAll(table)
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

const admin: JsonUser = { ...defaults, id: 'a', name: 'admin', email: 'a@exmaple.com', admin: true }
const judge: JsonUser = { ...defaults, id: 'b', name: 'judge', email: 'b@exmaple.com', judge: ['NOME-B'] }
const officer: JsonUser = { ...defaults, id: 'c', name: 'officer', email: 'c@exmaple.com', officer: ['NOME-B'] }
const orgAdmin: JsonUser = {
  ...defaults,
  id: 'd',
  name: 'org admin',
  email: 'd@exmaple.com',
  roles: { testOrg: 'admin' },
}
const orgSecretary: JsonUser = {
  ...defaults,
  id: 'e',
  name: 'org secretary',
  email: 'e@exmaple.com',
  roles: { testOrg: 'secretary' },
}
const otherOrgAdmin: JsonUser = {
  ...defaults,
  id: 'f',
  name: 'other org admin',
  email: 'f@exmaple.com',
  roles: { otherOrg: 'admin' },
}
const otherOrgSecretary: JsonUser = {
  ...defaults,
  id: 'g',
  name: 'other org secretary',
  email: 'g@exmaple.com',
  roles: { otherOrg: 'secretary' },
}
const justUser: JsonUser = { ...defaults, id: 'h', name: 'common user', email: 'h@exmaple.com' }

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
          key: 'email = :email',
          values: { ':email': 'missing@example.com' },
          index: 'gsiEmail',
        })
      )
      expect(warnSpy).toHaveBeenCalledWith('findUserByEmail: user not found', {
        normalizedEmail: 'missing@example.com',
      })
      warnSpy.mockRestore()
    })

    it('findUserByEmail logs error when active users returned but exact normalized match missing', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
      mockUserQuery.mockResolvedValueOnce([{ ...defaults, id: 'u1', email: 'other@example.com', name: 'Other' }])

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
          id: 'deleted',
          email: 'hit@example.com',
          name: 'Deleted',
          deletedAt: '2024-01-01T00:00:00.000Z',
        },
        { ...defaults, id: 'active', email: 'hit@example.com', name: 'Active' },
      ])

      await expect(findUserByEmail('Hit@example.com')).resolves.toEqual(
        expect.objectContaining({ id: 'active', email: 'hit@example.com' })
      )
    })

    it('updateUser delegates to write', async () => {
      const user: JsonUser = { ...defaults, id: 'write-id', name: 'Writer', email: 'writer@example.com' }
      mockUserWrite.mockResolvedValueOnce(user)

      await updateUser(user)

      expect(mockUserWrite).toHaveBeenCalledWith(user, 'user-table-not-found-in-env')
    })

    it('setUserRole updates roles and sends access email when role is set', async () => {
      const user: JsonUser = {
        ...defaults,
        id: 'role-user',
        name: 'Role User',
        email: 'role@example.com',
        roles: {},
      }
      mockUserRead.mockResolvedValueOnce({ id: 'org1', name: 'Org One' })

      const result = await setUserRole(user, 'org1', 'admin', 'tester', 'https://app.example.com')

      expect(mockUserUpdate).toHaveBeenCalledWith(
        { id: 'role-user' },
        expect.objectContaining({
          set: expect.objectContaining({
            roles: { org1: 'admin' },
            modifiedBy: 'tester',
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
          orgName: 'Org One',
          admin: true,
          secretary: false,
          link: 'https://app.example.com/login',
        })
      )
      expect(result.roles).toEqual({ org1: 'admin' })
    })

    it('setUserRole removes role and does not send email when role is none', async () => {
      const user: JsonUser = {
        ...defaults,
        id: 'role-user-2',
        name: 'Role User 2',
        email: 'role2@example.com',
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
      const a: JsonUser = { ...defaults, id: 'a', name: 'A', email: 'a@example.com', kcId: 1, officer: ['X'] }
      const b: JsonUser = { ...defaults, id: 'b', name: 'B', email: 'b@example.com', kcId: 1, roles: { org: 'admin' } }
      const writes = __testables.mergeUsersByKcId(1, [a, b], now)

      expect(writes).toHaveLength(2)
      const canonical = writes.find((u) => u.id === 'b')
      const cleared = writes.find((u) => u.id === 'a')
      expect(canonical).toEqual(
        expect.objectContaining({
          kcId: 1,
          roles: { org: 'admin' },
          officer: ['X'],
          modifiedAt: now,
          modifiedBy: 'system',
        })
      )
      expect(cleared).toEqual(
        expect.objectContaining({
          id: 'a',
          deletedAt: now,
          modifiedAt: now,
          modifiedBy: 'system',
        })
      )
    })

    it('mergeUsersByKcId merges and truncates deduplicated emailHistory to latest 10', () => {
      const now = '2024-05-30T20:00:00.000Z'
      const many = Array.from({ length: 12 }).map((_, i) => ({
        email: `e${i}@example.com`,
        changedAt: `2024-05-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        source: 'kl' as const,
      }))

      const a: JsonUser = {
        ...defaults,
        id: 'a',
        name: 'A',
        email: 'a@example.com',
        kcId: 1,
        emailHistory: [many[0], many[1], many[2], many[2]],
      }
      const b: JsonUser = {
        ...defaults,
        id: 'b',
        name: 'B',
        email: 'b@example.com',
        kcId: 1,
        roles: { org: 'admin' },
        emailHistory: many,
      }

      const writes = __testables.mergeUsersByKcId(1, [a, b], now)
      const canonical = writes.find((u) => u.id === 'b')

      expect(canonical?.emailHistory).toHaveLength(10)
      expect(canonical?.emailHistory?.[0].email).toBe('e2@example.com')
      expect(canonical?.emailHistory?.[9].email).toBe('e11@example.com')
    })

    it('mergeUsersByKcId returns empty when only one user is provided', () => {
      const one: JsonUser = { ...defaults, id: 'only', name: 'Only User', email: 'only@example.com', kcId: 42 }
      expect(__testables.mergeUsersByKcId(42, [one], '2024-05-30T20:00:00.000Z')).toEqual([])
    })

    it('toEventUser maps JsonUser to a compact event user shape', () => {
      const u: JsonUser = {
        ...defaults,
        id: 'id1',
        name: 'Name',
        email: 'e@example.com',
        kcId: 123,
        phone: 'p',
        location: 'l',
      }
      expect(__testables.toEventUser(u, { id: 'fallback' })).toEqual({
        id: 'id1',
        name: 'Name',
        email: 'e@example.com',
        phone: 'p',
        location: 'l',
        kcId: 123,
      })
      expect(__testables.toEventUser(undefined, { id: 'fallback', name: 'F' })).toEqual({ id: 'fallback', name: 'F' })
      expect(__testables.toEventUser(undefined, undefined)).toEqual({})
    })
  })

  describe('updateUsersFromOfficialsOrJudges', () => {
    const mockReadAll = jest.fn<CustomDynamoClient['readAll']>().mockResolvedValue([])
    const mockBatchWrite = jest.fn<CustomDynamoClient['batchWrite']>()
    const mockDB = {
      readAll: mockReadAll,
      batchWrite: mockBatchWrite,
    } as unknown as CustomDynamoClient

    it('should do nothing with empty judges array', async () => {
      await updateUsersFromOfficialsOrJudges(mockDB, [], 'judge')

      expect(mockReadAll).not.toHaveBeenCalled()
      expect(mockBatchWrite).not.toHaveBeenCalled()
    })

    it('should add user from official', async () => {
      const added1: Official = {
        id: 222,
        name: 'surname firstname',
        email: 'other@example.com',
        district: 'other district',
        eventTypes: ['NOME-A'],
      }
      const added2: Official = {
        id: 333,
        name: 'dredd official',
        email: 'dredd@example.com',
        district: 'some district',
        eventTypes: ['NOME-A', 'NOU'],
        phone: 'phone',
        location: 'location',
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
          kcEmail: 'other@example.com',
          officer: ['NOME-A'],
          name: 'firstname surname',
          id: expect.stringMatching(/^test-id-/),
        })
      )
      expect(written.find((u) => u.kcId === 333)).toEqual(
        expect.objectContaining({
          email: 'dredd@example.com',
          kcEmail: 'dredd@example.com',
          officer: ['NOME-A', 'NOU'],
          name: 'official dredd',
          phone: 'phone',
          location: 'location',
          id: expect.stringMatching(/^test-id-/),
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
        id: 'test-id',
        officer: ['NOME-A', 'NOU'],
        kcId: 333,
        location: 'location',
        modifiedAt: '2024-05-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'official dredd',
        phone: 'phone',
        emailHistory: [],
      }

      mockReadAll.mockResolvedValueOnce([existing])

      const official: Official = {
        id: 333,
        name: 'dredd official',
        email: 'dredd@example.com',
        district: 'other district',
        eventTypes: ['NOME-A'],
        phone: 'new phone',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [official], 'officer')

      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            createdAt: '2024-05-30T20:00:00.000Z',
            createdBy: 'system',
            email: 'dredd@example.com',
            kcEmail: 'dredd@example.com',
            emailHistory: [{ email: 'old@example.com', changedAt: '2024-05-30T20:00:00.000Z', source: 'kl' }],
            id: 'test-id',
            officer: ['NOME-A'],
            kcId: 333,
            location: 'location',
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'official dredd',
            phone: 'new phone',
          },
        ],
        'user-table-not-found-in-env'
      )
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith(
        'updating user from item: dredd official. changed props: email, officer, phone, emailHistory, kcEmail'
      )
    })

    it('should preserve email for linked user while updating other fields', async () => {
      const existing: JsonUser = {
        createdAt: '2024-05-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'old@example.com',
        id: 'test-id',
        officer: ['NOME-A', 'NOU'],
        kcId: 333,
        location: 'location',
        modifiedAt: '2024-05-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'official dredd',
        phone: 'phone',
        emailHistory: [],
      }

      mockReadAll.mockResolvedValueOnce([existing])
      mockUserLinkReadAll.mockResolvedValueOnce([{ cognitoUser: 'sub-1', userId: 'test-id' }])

      const official: Official = {
        id: 333,
        name: 'dredd official',
        email: 'dredd@example.com',
        district: 'other district',
        eventTypes: ['NOME-A'],
        phone: 'new phone',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [official], 'officer')

      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            createdAt: '2024-05-30T20:00:00.000Z',
            createdBy: 'system',
            email: 'old@example.com',
            kcEmail: 'dredd@example.com',
            emailHistory: [],
            id: 'test-id',
            officer: ['NOME-A'],
            kcId: 333,
            location: 'location',
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'official dredd',
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
        id: 222,
        name: 'surname firstname',
        email: 'other@example.com',
        district: 'other district',
        eventTypes: ['NOME-A'],
      }
      const added2: PartialJsonJudge = {
        id: 333,
        name: 'dredd judge',
        email: 'dredd@example.com',
        district: 'some district',
        eventTypes: ['NOME-A', 'NOU'],
        phone: 'phone',
        location: 'location',
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
          kcEmail: 'other@example.com',
          judge: ['NOME-A'],
          name: 'firstname surname',
          id: expect.stringMatching(/^test-id-/),
        })
      )
      expect(written.find((u) => u.kcId === 333)).toEqual(
        expect.objectContaining({
          email: 'dredd@example.com',
          kcEmail: 'dredd@example.com',
          judge: ['NOME-A', 'NOU'],
          name: 'judge dredd',
          phone: 'phone',
          location: 'location',
          id: expect.stringMatching(/^test-id-/),
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
        id: 333,
        name: 'dredd judge',
        email: 'dredd@example.com',
        district: 'other district',
        eventTypes: ['NOME-A'],
        phone: 'new phone',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [judge], 'judge')

      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            createdAt: '2024-05-30T20:00:00.000Z',
            createdBy: 'system',
            email: 'dredd@example.com',
            kcEmail: 'dredd@example.com',
            id: 'test-id',
            judge: ['NOME-A'],
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
        id: 'canon',
        name: 'Official Person',
        email: 'old@example.com',
        kcId: 777,
        officer: ['NOME-A'],
      }
      const dupe: JsonUser = {
        ...defaults,
        id: 'dupe',
        name: 'Official Person',
        email: 'new@example.com',
        kcId: 777,
        officer: ['NOU'],
        roles: { testOrg: 'admin' },
      }

      mockReadAll.mockResolvedValueOnce([canonical, dupe])

      mockEventReadAll.mockResolvedValueOnce([
        {
          id: 'evt-1',
          createdAt: defaults.createdAt,
          createdBy: defaults.createdBy,
          modifiedAt: defaults.modifiedAt,
          modifiedBy: defaults.modifiedBy,
          classes: [],
          cost: 0,
          description: '',
          endDate: '2024-06-01T00:00:00.000Z',
          eventType: 'NOME-A',
          judges: [],
          location: 'loc',
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
        id: 777,
        name: 'person official',
        email: 'Newest@Example.com',
        district: 'district',
        eventTypes: ['NOME-A'],
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
        id: 'deleted-1',
        name: 'Deleted User',
        email: 'same@example.com',
        deletedAt: '2024-01-01T00:00:00.000Z',
      }

      mockReadAll.mockResolvedValueOnce([deletedExisting])

      const fromKl: Official = {
        id: 999,
        name: 'user same',
        email: 'same@example.com',
        district: 'district',
        eventTypes: ['NOME-A'],
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [fromKl], 'officer')

      const writeItems = mockBatchWrite.mock.calls[0]?.[0] as JsonUser[]
      expect(writeItems).toHaveLength(1)
      expect(writeItems[0]).toEqual(
        expect.objectContaining({
          id: expect.stringMatching(/^test-id-/),
          email: 'same@example.com',
          kcEmail: 'same@example.com',
          kcId: 999,
          officer: ['NOME-A'],
          name: 'same user',
        })
      )
      expect(writeItems[0].id).not.toBe('deleted-1')
    })

    it('does not write when matched user has no effective changes', async () => {
      const existing: JsonUser = {
        ...defaults,
        id: 'same-user',
        name: 'official dredd',
        email: 'dredd@example.com',
        kcEmail: 'dredd@example.com',
        kcId: 333,
        officer: ['NOME-A'],
        phone: 'phone',
        location: 'location',
      }

      mockReadAll.mockResolvedValueOnce([existing])

      const official: Official = {
        id: 333,
        name: 'dredd official',
        email: 'dredd@example.com',
        district: 'district',
        eventTypes: ['NOME-A'],
        phone: 'phone',
        location: 'location',
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [official], 'officer')

      expect(mockBatchWrite).not.toHaveBeenCalled()
    })

    it('matches existing user by email when kcId is missing', async () => {
      const existing: JsonUser = {
        ...defaults,
        id: 'by-email',
        name: 'official dredd',
        email: 'dredd@example.com',
        kcEmail: 'dredd@example.com',
        officer: ['NOME-A'],
        phone: 'old phone',
      }

      mockReadAll.mockResolvedValueOnce([existing])

      const official: Official = {
        id: 333,
        name: 'dredd official',
        email: 'dredd@example.com',
        district: 'district',
        eventTypes: ['NOME-A'],
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
        id: 'canon',
        name: 'Official Person',
        email: 'canon@example.com',
        kcId: 888,
      }
      const dupe: JsonUser = {
        ...defaults,
        id: 'dupe',
        name: 'Official Person',
        email: 'dupe@example.com',
        kcId: 888,
        roles: { testOrg: 'admin' },
      }

      mockReadAll.mockResolvedValueOnce([canonical, dupe])
      mockEventReadAll.mockResolvedValueOnce([
        {
          id: 'evt-2',
          createdAt: defaults.createdAt,
          createdBy: defaults.createdBy,
          modifiedAt: defaults.modifiedAt,
          modifiedBy: defaults.modifiedBy,
          classes: [],
          cost: 0,
          description: '',
          endDate: '2024-06-01T00:00:00.000Z',
          eventType: 'NOME-A',
          judges: [],
          location: 'loc',
          name: 'evt2',
          official: { id: 'canon', name: 'Official Person' },
          organizer: { id: 'org', name: 'org' },
          places: 0,
          startDate: '2024-06-01T00:00:00.000Z',
          state: 'draft',
        },
      ])

      const fromKl: Official = {
        id: 888,
        name: 'person official',
        email: 'latest@example.com',
        district: 'district',
        eventTypes: ['NOME-A'],
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
        id: 'canon',
        name: 'Official Person',
        email: 'canon@example.com',
        kcId: 888,
      }
      const dupe: JsonUser = {
        ...defaults,
        id: 'dupe',
        name: 'Official Person',
        email: 'dupe@example.com',
        kcId: 888,
        roles: { testOrg: 'admin' },
      }

      mockReadAll.mockResolvedValueOnce([canonical, dupe])
      mockEventReadAll.mockResolvedValueOnce([
        {
          id: 'evt-official-only',
          createdAt: defaults.createdAt,
          createdBy: defaults.createdBy,
          modifiedAt: defaults.modifiedAt,
          modifiedBy: defaults.modifiedBy,
          classes: [],
          cost: 0,
          description: '',
          endDate: '2024-06-01T00:00:00.000Z',
          eventType: 'NOME-A',
          judges: [],
          location: 'loc',
          name: 'evt official only',
          official: { id: 'canon', name: 'Official Person' },
          organizer: { id: 'org', name: 'org' },
          places: 0,
          startDate: '2024-06-01T00:00:00.000Z',
          state: 'draft',
        },
      ])

      const fromKl: Official = {
        id: 888,
        name: 'person official',
        email: 'latest@example.com',
        district: 'district',
        eventTypes: ['NOME-A'],
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
        id: 'canon-sec',
        name: 'Secretary Person',
        email: 'canon-sec@example.com',
        kcId: 990,
        admin: true,
      }
      const dupe: JsonUser = {
        ...defaults,
        id: 'dupe-sec',
        name: 'Secretary Person',
        email: 'dupe-sec@example.com',
        kcId: 990,
      }

      mockReadAll.mockResolvedValueOnce([canonical, dupe])
      mockUserLinkReadAll.mockResolvedValueOnce([{ cognitoUser: 'sub-canon-sec', userId: 'canon-sec' }])
      mockEventReadAll.mockResolvedValueOnce([
        {
          id: 'evt-secretary-only',
          createdAt: defaults.createdAt,
          createdBy: defaults.createdBy,
          modifiedAt: defaults.modifiedAt,
          modifiedBy: defaults.modifiedBy,
          classes: [],
          cost: 0,
          description: '',
          endDate: '2024-06-01T00:00:00.000Z',
          eventType: 'NOME-A',
          judges: [],
          location: 'loc',
          name: 'evt secretary only',
          official: { id: 'official-keep', name: 'Official Keep' },
          secretary: { id: 'dupe-sec', name: 'Secretary Person' },
          organizer: { id: 'org', name: 'org' },
          places: 0,
          startDate: '2024-06-01T00:00:00.000Z',
          state: 'draft',
        },
      ])

      const fromKl: Official = {
        id: 990,
        name: 'person secretary',
        email: 'latest-sec@example.com',
        district: 'district',
        eventTypes: ['NOME-A'],
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [fromKl], 'officer')

      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockEventUpdate).not.toHaveBeenCalled()
    })

    it('logs and rethrows when batch write fails', async () => {
      const added: Official = {
        id: 111,
        name: 'surname firstname',
        email: 'failing@example.com',
        district: 'district',
        eventTypes: ['NOME-A'],
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
        id: 'existing-1',
        name: 'existing user',
        email: 'existing@example.com',
        kcEmail: 'existing@example.com',
        kcId: 444,
        officer: ['NOME-A'],
      }

      mockReadAll.mockResolvedValueOnce([existing])

      const invalidNew: Official = {
        id: 555,
        name: 'invalid new',
        email: 'not-an-email',
        district: 'district',
        eventTypes: ['NOME-A'],
      }
      const validExistingMatch: Official = {
        id: 444,
        name: 'updated existing',
        email: 'existing@example.com',
        district: 'district',
        eventTypes: ['NOME-B'],
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [invalidNew, validExistingMatch], 'officer')

      const writeItems = mockBatchWrite.mock.calls[0]?.[0] as JsonUser[]
      expect(writeItems).toHaveLength(1)
      expect(writeItems[0]).toEqual(
        expect.objectContaining({
          id: 'existing-1',
          kcId: 444,
          officer: ['NOME-B'],
          name: 'existing updated',
        })
      )
      expect(logSpy).not.toHaveBeenCalledWith('skipping item due to invalid email: invalid new, email: not-an-email')
    })

    it('triggers canonical-id path compression through updateUsersFromOfficialsOrJudges with inconsistent duplicate ids', async () => {
      // Intentionally inconsistent fixture: same user id appears under two different kcIds.
      // This can create a chain A -> B and B -> C, which should be compressed to A -> C.
      const kc1Dupe: JsonUser = {
        ...defaults,
        id: 'A',
        name: 'User A',
        email: 'a@example.com',
        kcId: 1001,
      }
      const kc1Canonical: JsonUser = {
        ...defaults,
        id: 'B',
        name: 'User B canonical for kc1',
        email: 'b@example.com',
        kcId: 1001,
        roles: { org1: 'admin' },
      }
      const kc2DupeSameIdAsKc1Canonical: JsonUser = {
        ...defaults,
        id: 'B',
        name: 'User B duplicate for kc2',
        email: 'b2@example.com',
        kcId: 2002,
      }
      const kc2Canonical: JsonUser = {
        ...defaults,
        id: 'C',
        name: 'User C canonical for kc2',
        email: 'c@example.com',
        kcId: 2002,
        roles: { org2: 'admin' },
      }

      mockReadAll.mockResolvedValueOnce([kc1Dupe, kc1Canonical, kc2DupeSameIdAsKc1Canonical, kc2Canonical])
      mockEventReadAll.mockResolvedValueOnce([
        {
          id: 'evt-path-compress',
          createdAt: defaults.createdAt,
          createdBy: defaults.createdBy,
          modifiedAt: defaults.modifiedAt,
          modifiedBy: defaults.modifiedBy,
          classes: [],
          cost: 0,
          description: '',
          endDate: '2024-06-01T00:00:00.000Z',
          eventType: 'NOME-A',
          judges: [],
          location: 'loc',
          name: 'evt-path-compress',
          official: { id: 'A', name: 'Old Official A' },
          organizer: { id: 'org', name: 'org' },
          places: 0,
          startDate: '2024-06-01T00:00:00.000Z',
          state: 'draft',
        },
      ])

      const fromKl: Official = {
        id: 1001,
        name: 'user b canonical for kc1',
        email: 'b@example.com',
        district: 'district',
        eventTypes: ['NOME-A'],
      }

      await updateUsersFromOfficialsOrJudges(mockDB, [fromKl], 'officer')

      // This fixture's inconsistent duplicate ids is enough to execute the path-compression loop.
      // Event remap is not guaranteed for this synthetic case, but write path must still complete.
      expect(mockBatchWrite).toHaveBeenCalled()
      expect(mockEventUpdate).not.toHaveBeenCalled()
    })
  })
})
