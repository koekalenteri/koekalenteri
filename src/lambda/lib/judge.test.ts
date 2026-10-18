import type { JsonJudge } from '../../types'
import type { PartialJsonJudge } from './judge'
import type KLAPI from './KLAPI'
import { vi } from 'vitest'
import { loggedLines } from '../test-utils/logs'

vi.useFakeTimers()
vi.setSystemTime(new Date('2024-05-30T20:00:00Z'))
vi.doMock('nanoid', () => ({ nanoid: () => 'test-id' }))

// The rows the table holds, deleted ones included. The two readers see them the way the real
// client does: the live reader without the deleted rows, the other with them (KOE-1569).
const mockReadAll = vi.fn<() => Promise<JsonJudge[]>>().mockResolvedValue([])
const readLive = async () => (await mockReadAll()).filter((row) => !row.deletedAt)
const mockBatchWrite = vi.fn<(items: JsonJudge[]) => Promise<void>>().mockResolvedValue(undefined)
vi.doMock('./repositories/judgeRepository', () => ({
  readJudges: readLive,
  readJudgesIncludingDeleted: mockReadAll,
  writeJudges: mockBatchWrite,
}))

const { fetchJudgesForEventTypes, partializeJudge, updateJudges } = await import('./judge')

describe('judge', () => {
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchJudgesForEventTypes', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const mockReadJudges = vi.fn<KLAPI['lueKoemuodonYlituomarit']>().mockResolvedValue({ json: [], status: 200 })
    const mockKlapi = {
      lueKoemuodonYlituomarit: mockReadJudges,
      // The code under test calls only this method; the partial double converts here.
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
        .mockResolvedValueOnce({ json: [], status: 200 })
        .mockResolvedValueOnce({ error: 'error', status: 500 })
      const result = await fetchJudgesForEventTypes(mockKlapi, ['NOME-A', 'NOME-B'])

      expect(result).toBeUndefined()
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({
          context: 'fetchJudgesForEventTypes',
          error: 'error',
          eventType: 'NOME-B',
          label: 'judges',
          message: 'failed to fetch official directory, aborting',
          status: 500,
        }),
      ])
    })

    it('should not return duplicates', async () => {
      mockReadJudges
        .mockResolvedValueOnce({
          json: [
            {
              jäsennumero: 1,
              kennelpiiri: 'piiri',
              koemuodot: [
                { koemuoto: '', lyhenne: 'NOME-A' },
                { koemuoto: '', lyhenne: 'NOME-B' },
              ],
              nimi: 'tupmari 1',
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
              nimi: 'tupmari 1',
              paikkakunta: 'jossain ',
              puhelin: 'puh',
              sähköposti: 'toumari1@example.com',
            },
            {
              jäsennumero: 2,
              kennelpiiri: 'piiri',
              koemuodot: [{ koemuoto: '', lyhenne: 'NOME-B' }],
              nimi: 'tuomari 2',
              paikkakunta: 'jossain ',
              puhelin: 'puh',
              sähköposti: 'toumari2@example.com',
            },
          ],
          status: 200,
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
        mockTrial: true,
        modifiedAt: 'modifiedAt',
        modifiedBy: 'modifiedBy',
        name: 'name',
        official: false,
        phone: 'phone',
        updatedAt: 'updatedAt',
      }
      // `mockTrial` is the app's own (KOE-1357), like `active`: the Kennel Club sync must not compare or overwrite it.
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
    it('should do nothing with empty array', async () => {
      await updateJudges([])

      expect(mockReadAll).not.toHaveBeenCalled()
      expect(mockBatchWrite).not.toHaveBeenCalled()
    })

    it('should add new judges', async () => {
      await updateJudges([
        {
          district: 'some district',
          email: 'test@example.com',
          eventTypes: ['NOME-B'],
          id: 0,
          name: 'test',
        },
      ])

      expect(mockReadAll).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledWith([
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
      ])
      expect(loggedLines(infoSpy)).toEqual([
        expect.objectContaining({ id: 0, label: 'judge', message: 'new directory entry' }),
      ])
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

      await updateJudges([
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
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledWith([
        {
          ...existing,
          eventTypes: ['NOME-B', 'NOME-A'],
          location: 'home',
        },
      ])
      expect(loggedLines(infoSpy)).toEqual([
        expect.objectContaining({
          changedKeys: ['eventTypes', 'location'],
          id: 123,
          label: 'judge',
          message: 'updating directory entry',
        }),
      ])
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
        district: 'other district',
        email: 'other@example.com',
        eventTypes: ['NOME-A'],
        id: 222,
        name: 'other',
      }

      await updateJudges([added])

      expect(mockReadAll).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledTimes(1)
      expect(mockBatchWrite).toHaveBeenCalledWith([
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
      ])
      expect(loggedLines(infoSpy)).toEqual([
        expect.objectContaining({ id: 222, label: 'judge', message: 'new directory entry' }),
        expect.objectContaining({ id: 123, label: 'judge', message: 'deleting directory entry' }),
      ])
    })

    describe('a deleted judge back on the Kennel Club list', () => {
      const deleted: JsonJudge = {
        active: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        createdBy: 'system',
        deletedAt: '2024-03-01T00:00:00.000Z',
        deletedBy: 'system',
        district: 'some district',
        email: 'test@example.com',
        eventTypes: ['NOME-B'],
        id: 123,
        languages: ['fi', 'sv'],
        mockTrial: true,
        modifiedAt: '2024-01-01T00:00:00.000Z',
        modifiedBy: 'admin',
        name: 'test',
      }
      const back = {
        district: deleted.district,
        email: deleted.email,
        eventTypes: deleted.eventTypes,
        id: deleted.id,
        name: deleted.name,
      }

      it('is restored with what the app stored for it, though the Kennel Club fields did not change', async () => {
        mockReadAll.mockResolvedValueOnce([structuredClone(deleted)])

        await updateJudges([back])

        expect(mockBatchWrite).toHaveBeenCalledTimes(1)
        expect(mockBatchWrite).toHaveBeenCalledWith([
          {
            active: false,
            createdAt: '2024-01-01T00:00:00.000Z',
            createdBy: 'system',
            district: 'some district',
            email: 'test@example.com',
            eventTypes: ['NOME-B'],
            id: 123,
            languages: ['fi', 'sv'],
            mockTrial: true,
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'test',
          },
        ])
        expect(loggedLines(infoSpy)).toEqual([
          expect.objectContaining({ id: 123, label: 'judge', message: 'restoring directory entry' }),
        ])
      })

      it('is restored with the changed Kennel Club fields', async () => {
        mockReadAll.mockResolvedValueOnce([structuredClone(deleted)])

        await updateJudges([{ ...back, location: 'home' }])

        expect(mockBatchWrite).toHaveBeenCalledTimes(1)
        expect(mockBatchWrite).toHaveBeenCalledWith([
          {
            active: false,
            createdAt: '2024-01-01T00:00:00.000Z',
            createdBy: 'system',
            district: 'some district',
            email: 'test@example.com',
            eventTypes: ['NOME-B'],
            id: 123,
            languages: ['fi', 'sv'],
            location: 'home',
            mockTrial: true,
            modifiedAt: '2024-05-30T20:00:00.000Z',
            modifiedBy: 'system',
            name: 'test',
          },
        ])
      })
    })
  })
})
