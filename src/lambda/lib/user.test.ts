import type { JsonDbRecord, JsonUser, Official } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type { PartialJsonJudge } from './judge'
import { jest } from '@jest/globals'

jest.useFakeTimers()
jest.setSystemTime(new Date('2024-05-30T20:00:00Z'))
jest.unstable_mockModule('nanoid', () => ({ nanoid: () => 'test-id' }))

const { filterRelevantUsers, updateUsersFromOfficialsOrJudges } = await import('./user')

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
      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            createdAt: '2024-05-30T20:00:00.000Z',
            createdBy: 'system',
            email: 'other@example.com',
            id: 'test-id',
            kcId: 222,
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'firstname surname',
            officer: ['NOME-A'],
          },
          {
            createdAt: '2024-05-30T20:00:00.000Z',
            createdBy: 'system',
            email: 'dredd@example.com',
            id: 'test-id',
            kcId: 333,
            location: 'location',
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'official dredd',
            officer: ['NOME-A', 'NOU'],
            phone: 'phone',
          },
        ],
        'user-table-not-found-in-env'
      )
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith('creating user from item: surname firstname, email: other@example.com')
    })

    it('should update user from official', async () => {
      const existing: JsonUser = {
        createdAt: '2024-05-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'dredd@eXaMpLe.com',
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
        'updating user from item: dredd official. changed props: email, officer, phone'
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
      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            createdAt: '2024-05-30T20:00:00.000Z',
            createdBy: 'system',
            email: 'other@example.com',
            id: 'test-id',
            judge: ['NOME-A'],
            kcId: 222,
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'firstname surname',
          },
          {
            createdAt: '2024-05-30T20:00:00.000Z',
            createdBy: 'system',
            email: 'dredd@example.com',
            id: 'test-id',
            judge: ['NOME-A', 'NOU'],
            kcId: 333,
            location: 'location',
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'judge dredd',
            phone: 'phone',
          },
        ],
        'user-table-not-found-in-env'
      )
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
  })
})
