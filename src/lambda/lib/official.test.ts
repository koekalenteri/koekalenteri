import type { JsonOfficial, Official } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type KLAPI from './KLAPI'
import { jest } from '@jest/globals'

jest.useFakeTimers()
jest.setSystemTime(new Date('2024-05-30T20:00:00Z'))
jest.unstable_mockModule('nanoid', () => ({ nanoid: () => 'test-id' }))

const { fetchOfficialsForEventTypes, updateOfficials } = await import('./official')

describe('official', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('fetchOfficialsForEventTypes', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const mockReadOfficials = jest
      .fn<KLAPI['lueKoemuodonKoetoimitsijat']>()
      .mockResolvedValue({ json: [], status: 200 })
    const mockKlapi = {
      lueKoemuodonKoetoimitsijat: mockReadOfficials,
    } as unknown as KLAPI
    it('should return empty array for empty eventTypes input', async () => {
      const result = await fetchOfficialsForEventTypes(mockKlapi, [])
      expect(result).toEqual([])
      expect(mockReadOfficials).not.toHaveBeenCalled()
    })

    it('should call klapi for each event type', async () => {
      const result = await fetchOfficialsForEventTypes(mockKlapi, ['NOME-A', 'NOME-B'])
      expect(result).toEqual([])
      expect(mockReadOfficials).toHaveBeenCalledWith({ Kieli: 1, Koemuoto: 'NOME-A' })
      expect(mockReadOfficials).toHaveBeenCalledWith({ Kieli: 1, Koemuoto: 'NOME-B' })
      expect(mockReadOfficials).toHaveBeenCalledTimes(2)
    })

    it('should abort if some call fails', async () => {
      mockReadOfficials
        .mockResolvedValueOnce({ json: [], status: 200 })
        .mockResolvedValueOnce({ error: 'error', status: 500 })
      const result = await fetchOfficialsForEventTypes(mockKlapi, ['NOME-A', 'NOME-B'])

      expect(result).toBeUndefined()
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith(
        'fetchOfficialsForEventTypes: Failed to fetch officials for event type NOME-B. Status: 500, error: error. Aborting.'
      )
    })

    it('should not return duplicates', async () => {
      mockReadOfficials
        .mockResolvedValueOnce({
          json: [
            {
              jäsennumero: 1,
              kennelpiiri: 'piiri',
              koemuodot: [
                { koemuoto: '', lyhenne: 'NOME-A' },
                { koemuoto: '', lyhenne: 'NOME-B' },
              ],
              nimi: 'toimari 1',
              paikkakunta: 'jossain ',
              puhelin: 'puh',
              sähköposti: 'toumari1@example.com',
            },
          ],
          status: 200,
        })
        .mockResolvedValueOnce({
          json: [
            {
              jäsennumero: 1,
              kennelpiiri: 'piiri',
              koemuodot: [
                { koemuoto: '', lyhenne: 'NOME-A' },
                { koemuoto: '', lyhenne: 'NOME-B' },
              ],
              nimi: 'toimitsija 1',
              paikkakunta: 'jossain ',
              puhelin: 'puh',
              sähköposti: 'toumari1@example.com',
            },
            {
              jäsennumero: 2,
              kennelpiiri: 'piiri',
              koemuodot: [{ koemuoto: '', lyhenne: 'NOME-B' }],
              nimi: 'toimitsija 2',
              paikkakunta: 'jossain ',
              puhelin: 'puh',
              sähköposti: 'toumari2@example.com',
            },
          ],
          status: 200,
        })
      const result = await fetchOfficialsForEventTypes(mockKlapi, ['NOME-A', 'NOME-B'])

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
            "name": "Toimari 1",
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
            "name": "Toimitsija 2",
            "phone": "puh",
          },
        ]
      `)
    })
  })

  describe('updateOfficials', () => {
    const mockReadAll = jest.fn<CustomDynamoClient['readAll']>().mockResolvedValue([])
    const mockBatchWrite = jest.fn()
    const mockDB = {
      batchWrite: mockBatchWrite,
      readAll: mockReadAll,
    } as unknown as CustomDynamoClient

    it('should do nothing with empty array', async () => {
      await updateOfficials(mockDB, [])

      expect(mockReadAll).not.toHaveBeenCalled()
      expect(mockBatchWrite).not.toHaveBeenCalled()
    })

    it('should add new officials', async () => {
      await updateOfficials(mockDB, [
        {
          district: 'some district',
          email: 'test@example.com',
          eventTypes: ['NOME-B'],
          id: 0,
          name: 'test',
        },
      ])

      expect(mockReadAll).toHaveBeenCalledTimes(1)
      expect(mockReadAll).toHaveBeenCalledWith('official-table-not-found-in-env')
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            createdAt: '2024-05-30T20:00:00.000Z',
            createdBy: 'system',
            district: 'some district',
            email: 'test@example.com',
            eventTypes: ['NOME-B'],
            id: 0,
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'test',
          },
        ],
        'official-table-not-found-in-env'
      )
      expect(logSpy).toHaveBeenCalledWith('new official: test (0)')
      expect(logSpy).toHaveBeenCalledTimes(1)
    })

    it('should update officials', async () => {
      const existing: JsonOfficial = {
        createdAt: '2024-05-30T20:00:00.000Z',
        createdBy: 'system',
        district: 'some district',
        email: 'test@example.com',
        eventTypes: ['NOME-B'],
        id: 123,
        modifiedAt: '2024-05-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'test',
      }
      mockReadAll.mockResolvedValueOnce([existing])

      await updateOfficials(mockDB, [
        {
          district: existing.district,
          email: existing.email,
          eventTypes: ['NOME-B', 'NOME-A'],
          id: existing.id,
          location: 'home',
          name: existing.name,
        },
      ])

      expect(mockReadAll).toHaveBeenCalledTimes(1)
      expect(mockReadAll).toHaveBeenCalledWith('official-table-not-found-in-env')
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            ...existing,
            eventTypes: ['NOME-B', 'NOME-A'],
            location: 'home',
          },
        ],
        'official-table-not-found-in-env'
      )
      expect(logSpy).toHaveBeenCalledWith('updating official 123: changes: eventTypes, location')
      expect(logSpy).toHaveBeenCalledTimes(1)
    })

    it('should delete officials', async () => {
      const existing: JsonOfficial = {
        createdAt: '2024-05-30T20:00:00.000Z',
        createdBy: 'system',
        district: 'some district',
        email: 'test@example.com',
        eventTypes: ['NOME-B'],
        id: 123,
        modifiedAt: '2024-05-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'test',
      }
      mockReadAll.mockResolvedValueOnce([existing])

      const added: Official = {
        district: 'other district',
        email: 'other@example.com',
        eventTypes: ['NOME-A'],
        id: 222,
        name: 'other',
      }

      await updateOfficials(mockDB, [added])

      expect(mockReadAll).toHaveBeenCalledTimes(1)
      expect(mockReadAll).toHaveBeenCalledWith('official-table-not-found-in-env')
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            ...added,
            createdAt: new Date().toISOString(),
            createdBy: 'system',
            modifiedAt: new Date().toISOString(),
            modifiedBy: 'system',
          },
          {
            ...existing,
            deletedAt: new Date().toISOString(),
            deletedBy: 'system',
          },
        ],
        'official-table-not-found-in-env'
      )
      expect(logSpy).toHaveBeenCalledWith('new official: other (222)')
      expect(logSpy).toHaveBeenCalledWith('deleting official: test (123)')
      expect(logSpy).toHaveBeenCalledTimes(2)
    })

    it('should undefined dynamoDB result', async () => {
      mockReadAll.mockResolvedValueOnce(undefined)

      const added: Official = {
        district: 'other district',
        email: 'other@example.com',
        eventTypes: ['NOME-A'],
        id: 222,
        name: 'other',
      }

      await updateOfficials(mockDB, [added])

      expect(mockReadAll).toHaveBeenCalledTimes(1)
      expect(mockReadAll).toHaveBeenCalledWith('official-table-not-found-in-env')
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledWith(
        [
          {
            ...added,
            createdAt: new Date().toISOString(),
            createdBy: 'system',
            modifiedAt: new Date().toISOString(),
            modifiedBy: 'system',
          },
        ],
        'official-table-not-found-in-env'
      )
    })
  })
})
