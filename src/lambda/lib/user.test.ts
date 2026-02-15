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
      if (table && table.includes('event')) return mockEventReadAll(table)
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
      const base: JsonUser = { ...defaults, id: 'u1', name: 'u1', email: 'u1@example.com' }
      const withRoles: JsonUser = {
        ...defaults,
        id: 'u2',
        name: 'u2',
        email: 'u2@example.com',
        roles: { org: 'admin' },
      }
      expect(__testables.pickCanonicalUser([base, withRoles]).id).toBe('u2')

      const older: JsonUser = {
        ...defaults,
        id: 'u3',
        name: 'u3',
        email: 'u3@example.com',
        modifiedAt: '2020-01-01T00:00:00.000Z',
      }
      const newer: JsonUser = {
        ...defaults,
        id: 'u4',
        name: 'u4',
        email: 'u4@example.com',
        modifiedAt: '2021-01-01T00:00:00.000Z',
      }
      expect(__testables.pickCanonicalUser([older, newer]).id).toBe('u4')
    })

    it('pickCanonicalUserPreferLinked prefers users that have logged in (linked user ids)', () => {
      const base: JsonUser = { ...defaults, id: 'u1', name: 'u1', email: 'u1@example.com' }
      const higherScoreButUnlinked: JsonUser = {
        ...defaults,
        id: 'u2',
        name: 'u2',
        email: 'u2@example.com',
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
    })
  })

  describe('updateUsersFromOfficialsOrJudges', () => {
    const mockReadAll = jest.fn<CustomDynamoClient['readAll']>().mockResolvedValue([])
    const mockBatchWrite = jest.fn()
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
          officer: ['NOME-A'],
          name: 'firstname surname',
          id: expect.stringMatching(/^test-id-/),
        })
      )
      expect(written.find((u) => u.kcId === 333)).toEqual(
        expect.objectContaining({
          email: 'dredd@example.com',
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
        'updating user from item: dredd official. changed props: email, officer, phone, emailHistory'
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
          judge: ['NOME-A'],
          name: 'firstname surname',
          id: expect.stringMatching(/^test-id-/),
        })
      )
      expect(written.find((u) => u.kcId === 333)).toEqual(
        expect.objectContaining({
          email: 'dredd@example.com',
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

      // Events referencing dupe id are updated to point at canonical id.
      expect(mockEventUpdate).toHaveBeenCalledTimes(1)
      const [eventKey, updateSpec] = mockEventUpdate.mock.calls[0] as any
      expect(eventKey).toEqual({ id: 'evt-1' })
      expect(updateSpec.set.official.id).toEqual(writtenCanonical?.id)
      expect(updateSpec.set.secretary.id).toEqual(writtenCanonical?.id)
    })
  })
})
