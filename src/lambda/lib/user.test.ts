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
      return Promise.resolve([])
    }

    update = (...args: any[]) => mockEventUpdate(...args)
  },
}))

const { filterRelevantUsers, updateUsersFromOfficialsOrJudges, __testables } = await import('./user')

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

    it('pickCanonicalUser prefers higher score (roles/admin/officer/judge), then modifiedAt', () => {
      const base: JsonUser = { ...defaults, email: 'u1@example.com', id: 'u1', name: 'u1' }
      const withRoles: JsonUser = {
        ...defaults,
        email: 'u2@example.com',
        id: 'u2',
        name: 'u2',
        roles: { org: 'admin' },
      }
      expect(__testables.pickCanonicalUser([base, withRoles]).id).toBe('u2')

      const older: JsonUser = {
        ...defaults,
        email: 'u3@example.com',
        id: 'u3',
        modifiedAt: '2020-01-01T00:00:00.000Z',
        name: 'u3',
      }
      const newer: JsonUser = {
        ...defaults,
        email: 'u4@example.com',
        id: 'u4',
        modifiedAt: '2021-01-01T00:00:00.000Z',
        name: 'u4',
      }
      expect(__testables.pickCanonicalUser([older, newer]).id).toBe('u4')
    })

    it('pickCanonicalUserPreferLinked prefers users that have logged in (linked user ids)', () => {
      const base: JsonUser = { ...defaults, email: 'u1@example.com', id: 'u1', name: 'u1' }
      const higherScoreButUnlinked: JsonUser = {
        ...defaults,
        email: 'u2@example.com',
        id: 'u2',
        name: 'u2',
        roles: { org: 'admin' },
      }

      // Even though u2 has higher “business score”, u1 should win when it is linked.
      const linked = new Set<string>(['u1'])
      expect(__testables.pickCanonicalUserPreferLinked([base, higherScoreButUnlinked], linked).id).toBe('u1')

      // Without a link set, it should fall back to the normal scoring.
      expect(__testables.pickCanonicalUserPreferLinked([base, higherScoreButUnlinked], undefined).id).toBe('u2')
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
    })
  })

  describe('updateUsersFromOfficialsOrJudges', () => {
    const mockReadAll = jest.fn<CustomDynamoClient['readAll']>().mockResolvedValue([])
    const mockBatchWrite = jest.fn()
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
          name: 'firstname surname',
          officer: ['NOME-A'],
        })
      )
      expect(written.find((u) => u.kcId === 333)).toEqual(
        expect.objectContaining({
          email: 'dredd@example.com',
          id: expect.stringMatching(/^test-id-/),
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
        'updating user from item: dredd official. changed props: email, emailHistory, officer, phone'
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
          name: 'firstname surname',
        })
      )
      expect(written.find((u) => u.kcId === 333)).toEqual(
        expect.objectContaining({
          email: 'dredd@example.com',
          id: expect.stringMatching(/^test-id-/),
          judge: ['NOME-A', 'NOU'],
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
      expect(logSpy).toHaveBeenCalledWith('updating user from item: dredd judge. changed props: email, judge, phone')
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

      // Events referencing dupe id are updated to point at canonical id.
      expect(mockEventUpdate).toHaveBeenCalledTimes(1)
      const [eventKey, updateSpec] = mockEventUpdate.mock.calls[0] as any
      expect(eventKey).toEqual({ id: 'evt-1' })
      expect(updateSpec.set.official.id).toEqual(writtenCanonical?.id)
      expect(updateSpec.set.secretary.id).toEqual(writtenCanonical?.id)
    })
  })
})
