import type { JsonJudge, JsonUser } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type { PartialJsonJudge } from './judge'
import type KLAPI from './KLAPI'

import { jest } from '@jest/globals'

jest.useFakeTimers()
jest.setSystemTime(new Date('2024-05-30T20:00:00Z'))
jest.unstable_mockModule('nanoid', () => ({ nanoid: () => 'test-id' }))

const { fetchJudgesForEventTypes, partializeJudge, updateJudges, updateUsersFromJudges } = await import('./judge')

describe('judge', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('fetchJudgesForEventTypes', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const mockReadJudges = jest.fn<KLAPI['lueKoemuodonYlituomarit']>().mockResolvedValue({ status: 200, json: [] })
    const mockKlapi = {
      lueKoemuodonYlituomarit: mockReadJudges,
    } as unknown as KLAPI
    it('should return empty array for empty eventTypes input', async () => {
      const result = await fetchJudgesForEventTypes(mockKlapi, [])
      expect(result).toEqual([])
      expect(mockReadJudges).not.toHaveBeenCalled()
    })

    it('should call klapi for each event type', async () => {
      const result = await fetchJudgesForEventTypes(mockKlapi, ['NOME-A', 'NOME-B'])
      expect(result).toEqual([])
      expect(mockReadJudges).toHaveBeenCalledWith({ Kieli: 1, Koemuoto: 'NOME-A' })
      expect(mockReadJudges).toHaveBeenCalledWith({ Kieli: 1, Koemuoto: 'NOME-B' })
      expect(mockReadJudges).toHaveBeenCalledTimes(2)
    })

    it('should abort if some call fails', async () => {
      mockReadJudges
        .mockResolvedValueOnce({ status: 200, json: [] })
        .mockResolvedValueOnce({ status: 500, error: 'error' })
      const result = await fetchJudgesForEventTypes(mockKlapi, ['NOME-A', 'NOME-B'])

      expect(result).toBeUndefined()
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith(
        'fetchJudgesForEventTypes: Failed to fetch judges for event type NOME-B. Status: 500, error: error. Aborting.'
      )
    })

    it('should not return duplicates', async () => {
      mockReadJudges
        .mockResolvedValueOnce({
          status: 200,
          json: [
            {
              jäsennumero: 1,
              nimi: 'tupmari 1',
              paikkakunta: 'jossain ',
              kennelpiiri: 'piiri',
              puhelin: 'puh',
              sähköposti: 'toumari1@example.com',
              koemuodot: [
                { lyhenne: 'NOME-A', koemuoto: '' },
                { lyhenne: 'NOME-B', koemuoto: '' },
              ],
            },
          ],
        })
        .mockResolvedValueOnce({
          status: 200,
          json: [
            {
              jäsennumero: 1,
              nimi: 'tupmari 1',
              paikkakunta: 'jossain ',
              kennelpiiri: 'piiri',
              puhelin: 'puh',
              sähköposti: 'toumari1@example.com',
              koemuodot: [
                { lyhenne: 'NOME-A', koemuoto: '' },
                { lyhenne: 'NOME-B', koemuoto: '' },
              ],
            },
            {
              jäsennumero: 2,
              nimi: 'tuomari 2',
              paikkakunta: 'jossain ',
              kennelpiiri: 'piiri',
              puhelin: 'puh',
              sähköposti: 'toumari2@example.com',
              koemuodot: [{ lyhenne: 'NOME-B', koemuoto: '' }],
            },
          ],
        })
      const result = await fetchJudgesForEventTypes(mockKlapi, ['NOME-A', 'NOME-B'])

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "district": "piiri",
            "email": "toumari1@example.com",
            "eventTypes": [
              "NOME-A",
              "NOME-B",
            ],
            "id": 1,
            "location": "Jossain ",
            "name": "Tupmari 1",
            "official": true,
            "phone": "puh",
          },
          {
            "district": "piiri",
            "email": "toumari2@example.com",
            "eventTypes": [
              "NOME-B",
            ],
            "id": 2,
            "location": "Jossain ",
            "name": "Tuomari 2",
            "official": true,
            "phone": "puh",
          },
        ]
      `)
    })
  })

  describe('partializeJudge', () => {
    it('should remove excess properties', () => {
      const fullJudge: Required<JsonJudge> = {
        active: false,
        createdAt: 'createdAt',
        createdBy: 'createdBy',
        deletedAt: 'deletedAt',
        deletedBy: 'deletedBy',
        district: 'district',
        email: 'email',
        eventTypes: [],
        id: 0,
        languages: [],
        location: 'location',
        modifiedAt: 'modifiedAt',
        modifiedBy: 'modifiedBy',
        name: 'name',
        official: false,
        phone: 'phone',
      }
      expect(partializeJudge(fullJudge)).toMatchInlineSnapshot(`
        {
          "district": "district",
          "email": "email",
          "eventTypes": [],
          "id": 0,
          "location": "location",
          "name": "name",
          "official": false,
          "phone": "phone",
        }
      `)
    })
    it('should include optional properties', () => {
      const judge: JsonJudge = {
        createdAt: 'createdAt',
        createdBy: 'createdBy',
        deletedAt: 'deletedAt',
        deletedBy: 'deletedBy',
        district: 'district',
        email: 'email',
        eventTypes: [],
        id: 0,
        languages: [],
        modifiedAt: 'modifiedAt',
        modifiedBy: 'modifiedBy',
        name: 'name',
      }
      expect(partializeJudge(judge)).toMatchInlineSnapshot(`
        {
          "district": "district",
          "email": "email",
          "eventTypes": [],
          "id": 0,
          "location": undefined,
          "name": "name",
          "official": undefined,
          "phone": undefined,
        }
      `)
    })
  })

  describe('updateJudges', () => {
    const mockReadAll = jest.fn<CustomDynamoClient['readAll']>().mockResolvedValue([])
    const mockBatchWrite = jest.fn()
    const mockDB = {
      readAll: mockReadAll,
      batchWrite: mockBatchWrite,
    } as unknown as CustomDynamoClient

    it('should do nothing with empty array', async () => {
      await updateJudges(mockDB, [])

      expect(mockReadAll).not.toHaveBeenCalled()
      expect(mockBatchWrite).not.toHaveBeenCalled()
    })

    it('should add new judges', async () => {
      await updateJudges(mockDB, [
        {
          id: 0,
          name: 'test',
          email: 'test@example.com',
          district: 'some district',
          eventTypes: ['NOME-B'],
        },
      ])

      expect(mockReadAll).toHaveBeenCalledTimes(1)
      expect(mockReadAll).toHaveBeenCalledWith('judge-table-not-found-in-env')
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            active: true,
            createdAt: '2024-05-30T20:00:00.000Z',
            createdBy: 'system',
            district: 'some district',
            email: 'test@example.com',
            eventTypes: ['NOME-B'],
            id: 0,
            languages: [],
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'test',
          },
        ],
        'judge-table-not-found-in-env'
      )
      expect(logSpy).toHaveBeenCalledWith('new judge: test (0)')
      expect(logSpy).toHaveBeenCalledTimes(1)
    })

    it('should update judges', async () => {
      const existing: JsonJudge = {
        active: true,
        createdAt: '2024-05-30T20:00:00.000Z',
        createdBy: 'system',
        district: 'some district',
        email: 'test@example.com',
        eventTypes: ['NOME-B'],
        id: 123,
        languages: [],
        modifiedAt: '2024-05-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'test',
      }
      mockReadAll.mockResolvedValueOnce([existing])

      await updateJudges(mockDB, [
        {
          id: existing.id,
          name: existing.name,
          email: existing.email,
          district: existing.district,
          location: 'home',
          eventTypes: ['NOME-B', 'NOME-A'],
        },
      ])

      expect(mockReadAll).toHaveBeenCalledTimes(1)
      expect(mockReadAll).toHaveBeenCalledWith('judge-table-not-found-in-env')
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            ...existing,
            eventTypes: ['NOME-B', 'NOME-A'],
            location: 'home',
          },
        ],
        'judge-table-not-found-in-env'
      )
      expect(logSpy).toHaveBeenCalledWith('updating judge 123: changes: eventTypes, location')
      expect(logSpy).toHaveBeenCalledTimes(1)
    })

    it('should delete judges', async () => {
      const existing: JsonJudge = {
        active: true,
        createdAt: '2024-05-30T20:00:00.000Z',
        createdBy: 'system',
        district: 'some district',
        email: 'test@example.com',
        eventTypes: ['NOME-B'],
        id: 123,
        languages: [],
        modifiedAt: '2024-05-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'test',
      }
      mockReadAll.mockResolvedValueOnce([existing])

      const added: PartialJsonJudge = {
        id: 222,
        name: 'other',
        email: 'other@example.com',
        district: 'other district',
        eventTypes: ['NOME-A'],
      }

      await updateJudges(mockDB, [added])

      expect(mockReadAll).toHaveBeenCalledTimes(1)
      expect(mockReadAll).toHaveBeenCalledWith('judge-table-not-found-in-env')
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            ...added,
            active: true,
            createdAt: new Date().toISOString(),
            createdBy: 'system',
            languages: [],
            modifiedAt: new Date().toISOString(),
            modifiedBy: 'system',
          },
          {
            ...existing,
            deletedAt: new Date().toISOString(),
            deletedBy: 'system',
          },
        ],
        'judge-table-not-found-in-env'
      )
      expect(logSpy).toHaveBeenCalledWith('new judge: other (222)')
      expect(logSpy).toHaveBeenCalledWith('deleting judge: test (123)')
      expect(logSpy).toHaveBeenCalledTimes(2)
    })

    it('should undefined dynamoDB result', async () => {
      mockReadAll.mockResolvedValueOnce(undefined)

      const added: PartialJsonJudge = {
        id: 222,
        name: 'other',
        email: 'other@example.com',
        district: 'other district',
        eventTypes: ['NOME-A'],
      }

      await updateJudges(mockDB, [added])

      expect(mockReadAll).toHaveBeenCalledTimes(1)
      expect(mockReadAll).toHaveBeenCalledWith('judge-table-not-found-in-env')
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            ...added,
            active: true,
            createdAt: new Date().toISOString(),
            createdBy: 'system',
            languages: [],
            modifiedAt: new Date().toISOString(),
            modifiedBy: 'system',
          },
        ],
        'judge-table-not-found-in-env'
      )
    })
  })

  describe('updateUsersFromJudes', () => {
    const mockReadAll = jest.fn<CustomDynamoClient['readAll']>().mockResolvedValue([])
    const mockBatchWrite = jest.fn()
    const mockDB = {
      readAll: mockReadAll,
      batchWrite: mockBatchWrite,
    } as unknown as CustomDynamoClient

    it('should do nothing with empty judges array', async () => {
      await updateUsersFromJudges(mockDB, [])

      expect(mockReadAll).not.toHaveBeenCalled()
      expect(mockBatchWrite).not.toHaveBeenCalled()
    })

    it('should add user', async () => {
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

      await updateUsersFromJudges(mockDB, [added1, added2])

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
      expect(logSpy).toHaveBeenCalledWith('creating user from judge: surname firstname, email: other@example.com')
    })

    it('should update user', async () => {
      const existing: JsonUser = {
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

      await updateUsersFromJudges(mockDB, [judge])

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
      expect(logSpy).toHaveBeenCalledWith('updating user from judge: dredd judge. changed props: judge, phone')
    })
  })
})
