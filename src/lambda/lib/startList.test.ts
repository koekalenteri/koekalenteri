import type { JsonEventResult } from '../../types'
import { vi } from 'vitest'
import { asJsonConfirmedEvent, asJsonRegistration, eventNotFound } from '../test-utils/helpers'

const mockGetLiveEvent = vi.fn()
const mockReadEventRegistrations = vi.fn()

vi.doMock('./event', () => ({ getLiveEvent: mockGetLiveEvent }))
vi.doMock('./repositories/registrationRepository', () => ({
  readEventRegistrations: mockReadEventRegistrations,
}))

const { readPublishedStartList } = await import('./startList')

const publishedEvent = asJsonConfirmedEvent({
  classes: [{ class: 'ALO', state: 'invited' }],
  id: 'event-1',
  organizer: { id: 'org-1', name: 'Org' },
  startDate: '2025-01-01',
  startListPublished: { ALO: true },
  startNumbersPublished: { ALO: true },
  state: 'invited',
})

const registration = asJsonRegistration({
  cancelled: false,
  class: 'ALO',
  dog: { name: 'Aapo', regNo: 'REG-1' },
  eventId: 'event-1',
  group: { date: '2025-01-01', key: 'ALO', number: 1 },
  handler: { name: 'Handler' },
  owner: { name: 'Owner' },
  ownerHandles: false,
  startGroup: { date: '2025-01-01', key: 'ALO', number: 1 },
})

const STAMP = Date.parse('2025-01-01T10:00:00.000Z')

describe('readPublishedStartList (KOE-1516)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: STAMP, toFake: ['Date'] })
    mockGetLiveEvent.mockResolvedValue(publishedEvent)
    mockReadEventRegistrations.mockResolvedValue([registration])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the event and its registrations consistently and composes the published rows', async () => {
    await expect(readPublishedStartList('event-1')).resolves.toEqual({
      available: true,
      participants: [expect.objectContaining({ dog: { name: 'Aapo', regNo: 'REG-1' }, handler: 'Handler' })],
      version: STAMP,
    })

    expect(mockGetLiveEvent).toHaveBeenCalledWith('event-1', true)
    expect(mockReadEventRegistrations).toHaveBeenCalledWith('event-1', true)
  })

  it('stamps the version before reading, so a later stamp never describes an earlier read', async () => {
    mockGetLiveEvent.mockImplementationOnce(async () => {
      vi.setSystemTime(STAMP + 5000)
      return publishedEvent
    })

    await expect(readPublishedStartList('event-1')).resolves.toEqual(expect.objectContaining({ version: STAMP }))
  })

  it('reads a list that is not available as no rows, without reading the registrations', async () => {
    mockGetLiveEvent.mockResolvedValueOnce({ ...publishedEvent, startListPublished: { ALO: false } })

    await expect(readPublishedStartList('event-1')).resolves.toEqual({
      available: false,
      participants: [],
      version: STAMP,
    })
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
  })

  it('composes an unpublished list for a preview', async () => {
    mockGetLiveEvent.mockResolvedValueOnce({ ...publishedEvent, startListPublished: { ALO: false } })

    await expect(readPublishedStartList('event-1', { preview: true })).resolves.toEqual(
      expect.objectContaining({ available: true, participants: [expect.objectContaining({ handler: 'Handler' })] })
    )
    expect(mockGetLiveEvent).toHaveBeenCalledWith('event-1', true)
  })

  // KOE-1586: the public list of a deleted event was still served.
  it('answers a deleted event as a missing one, without reading the registrations', async () => {
    mockGetLiveEvent.mockRejectedValueOnce(eventNotFound('event-1'))

    await expect(readPublishedStartList('event-1')).rejects.toMatchObject({ status: 404 })

    expect(mockGetLiveEvent).toHaveBeenCalledWith('event-1', true)
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
  })

  it('answers a deleted event as a missing one for the preview too', async () => {
    mockGetLiveEvent.mockRejectedValueOnce(eventNotFound('event-1'))

    await expect(readPublishedStartList('event-1', { preview: true })).rejects.toMatchObject({ status: 404 })
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
  })

  it('lets the caller refuse the event before any registration is read', async () => {
    const checkEvent = vi.fn(() => {
      throw new Error('Forbidden')
    })

    await expect(readPublishedStartList('event-1', { checkEvent })).rejects.toThrow('Forbidden')

    expect(checkEvent).toHaveBeenCalledWith(publishedEvent)
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
  })

  // KOE-1489: the whole stored dog went out to every reader. What is compared is the JSON the reader
  // gets, since that is what the response and the live message carry.
  describe('the published dog', () => {
    const sentDog = async () => {
      const { participants } = await readPublishedStartList('event-1')
      return JSON.parse(JSON.stringify(participants))[0].dog
    }

    it('publishes only the dog fields the start list shows', async () => {
      mockReadEventRegistrations.mockResolvedValueOnce([
        {
          ...registration,
          dog: {
            breedCode: '122',
            callingName: 'Kutsumanimi',
            dam: { name: 'Emä', regNo: 'FI-D', titles: 'FI MVA' },
            dob: '2020-02-03',
            gender: 'F',
            kcId: 12345,
            name: 'Aapo',
            refreshDate: '2025-01-01T10:00:00.000Z',
            regNo: 'REG-1',
            results: [
              {
                class: 'ALO',
                date: '2024-06-01',
                judge: 'Tuomari',
                location: 'Paikka',
                result: 'ALO1',
                type: 'NOME-B',
              },
            ],
            rfid: '246000000000001',
            rfidEditable: false,
            sire: { name: 'Isä', regNo: 'FI-S', titles: 'C.I.B.' },
            titles: 'FI KVA-WT',
          },
        },
      ])

      await expect(sentDog()).resolves.toStrictEqual({
        breedCode: '122',
        dam: { name: 'Emä', titles: 'FI MVA' },
        dob: '2020-02-03',
        gender: 'F',
        name: 'Aapo',
        regNo: 'REG-1',
        sire: { name: 'Isä', titles: 'C.I.B.' },
        titles: 'FI KVA-WT',
      })
    })

    it('sends no parents for a dog without them', async () => {
      await expect(sentDog()).resolves.toStrictEqual({ name: 'Aapo', regNo: 'REG-1' })
    })
  })

  describe('placement', () => {
    const resultsEvent = {
      ...publishedEvent,
      classes: [{ class: 'ALO', state: 'ended' as const }],
      eventType: 'NOWT',
      resultsPublished: { ALO: true },
      state: 'ended' as const,
    }
    const scored = (id: string, result: string, points: number) =>
      asJsonRegistration({
        ...registration,
        eventResult: { maxPoints: 100, points, result, updatedAt: '', updatedBy: '' },
        eventType: 'NOWT',
        group: { date: '2025-01-01', key: 'participants', number: 1 },
        id,
      })

    it('publishes the rank beside the result, ties sharing one', async () => {
      mockGetLiveEvent.mockResolvedValue(resultsEvent)
      mockReadEventRegistrations.mockResolvedValue([
        scored('a', 'ALO1', 90),
        scored('b', 'ALO2', 70),
        scored('c', 'ALO2', 70),
        scored('d', 'ALO0', 40),
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants.map(({ placement, result }) => [result, placement])).toEqual([
        ['ALO1', 1],
        ['ALO2', 2],
        ['ALO2', 2],
        ['ALO0', undefined],
      ])
    })

    it('counts a dog whose row is withheld in the rank of the published ones', async () => {
      mockGetLiveEvent.mockResolvedValue(resultsEvent)
      mockReadEventRegistrations.mockResolvedValue([
        scored('a', 'ALO2', 70),
        // Its number is not entered yet, so it stays off the list, but it still ran ahead of the others.
        { ...scored('w', 'ALO1', 95), startGroup: undefined },
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toEqual([expect.objectContaining({ placement: 2, result: 'ALO2' })])
    })

    it('publishes a NOME-A result as Kennelliitto lists it, while the stored one keeps its prefix (KOE-1592)', async () => {
      mockGetLiveEvent.mockResolvedValue({
        ...resultsEvent,
        classes: [],
        eventType: 'NOME-A',
        resultsPublished: true,
        startListPublished: true,
        startNumbersPublished: true,
      })
      mockReadEventRegistrations.mockResolvedValue([
        asJsonRegistration({
          ...registration,
          class: undefined,
          eventResult: { result: 'NOME-A1', updatedAt: '', updatedBy: '' },
          eventType: 'NOME-A',
          group: { date: '2025-01-01', key: 'participants', number: 1 },
          startGroup: { date: '2025-01-01', key: 'participants', number: 1 },
        }),
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toEqual([expect.objectContaining({ result: 'A1' })])
    })

    it('withholds the rank where the results are not published', async () => {
      mockGetLiveEvent.mockResolvedValue({ ...resultsEvent, resultsPublished: { ALO: false } })
      mockReadEventRegistrations.mockResolvedValue([scored('a', 'ALO1', 90)])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toHaveLength(1)
      expect(participants[0]).not.toHaveProperty('placement')
    })
  })

  describe('totals (KOE-1673)', () => {
    // Two posts of one exercise each, worth 20 apiece, so the dog's round is worth 40.
    const scoredEvent = {
      ...publishedEvent,
      classes: [{ class: 'ALO', state: 'ended' as const }],
      eventType: 'NOWT',
      resultsPublished: { ALO: true },
      state: 'ended' as const,
      stations: [1, 2].map((number) => ({ date: '2025-01-01', id: `post-${number}`, number })),
    }
    const at = { updatedAt: '2025-01-01T09:00:00.000Z', updatedBy: 'Sihteeri' }
    const scoredRow = (eventResult: JsonEventResult, eventType = 'NOWT') =>
      asJsonRegistration({
        ...registration,
        eventResult,
        eventType,
        group: { date: '2025-01-01', key: 'participants', number: 1 },
      })
    const awarded: JsonEventResult = { ...at, maxPoints: 40, percentage: 82.5, points: 33, result: 'ALO1' }

    it('publishes the points, the maximum and the percentage with the result', async () => {
      mockGetLiveEvent.mockResolvedValue(scoredEvent)
      mockReadEventRegistrations.mockResolvedValue([scoredRow(awarded)])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toEqual([
        expect.objectContaining({ maxPoints: 40, percentage: 82.5, placement: 1, points: 33, result: 'ALO1' }),
      ])
    })

    it('withholds them where the results are not published', async () => {
      mockGetLiveEvent.mockResolvedValue({ ...scoredEvent, resultsPublished: { ALO: false } })
      mockReadEventRegistrations.mockResolvedValue([scoredRow(awarded)])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toHaveLength(1)
      for (const key of ['points', 'maxPoints', 'percentage']) expect(participants[0]).not.toHaveProperty(key)
    })

    it('works out what a round that ended early earned when it was stored without totals (KOE-1669)', async () => {
      mockGetLiveEvent.mockResolvedValue(scoredEvent)
      mockReadEventRegistrations.mockResolvedValue([
        scoredRow({
          ...at,
          result: 'ALO-',
          retirement: { cause: 'injury', exercise: 2 },
          tasks: [{ ...at, exercise: 1, part: 0, points: 12 }],
        }),
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toEqual([
        expect.objectContaining({ marks: ['interrupted'], maxPoints: 40, percentage: 30, points: 12, result: 'ALO-' }),
      ])
      // A dash takes no rank, whatever it earned.
      expect(participants[0]).not.toHaveProperty('placement')
    })

    it('publishes none for a dog whose round has no result yet', async () => {
      mockGetLiveEvent.mockResolvedValue(scoredEvent)
      mockReadEventRegistrations.mockResolvedValue([
        scoredRow({
          ...at,
          maxPoints: 40,
          percentage: 50,
          points: 20,
          tasks: [{ ...at, exercise: 1, part: 0, points: 20 }],
        }),
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toHaveLength(1)
      for (const key of ['points', 'maxPoints', 'percentage']) expect(participants[0]).not.toHaveProperty(key)
    })

    it('publishes none for a type not scored at posts', async () => {
      // Tasks and totals a qualitative row never holds, so neither the fill-in nor the publication may
      // read them: only a type scored at posts has totals to show.
      mockGetLiveEvent.mockResolvedValue({ ...scoredEvent, eventType: 'NOME-B' })
      mockReadEventRegistrations.mockResolvedValue([
        scoredRow({ ...at, result: 'ALO1', tasks: [{ ...at, exercise: 1, part: 0, points: 12 }] }, 'NOME-B'),
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toEqual([expect.objectContaining({ result: 'ALO1' })])
      for (const key of ['points', 'maxPoints', 'percentage']) expect(participants[0]).not.toHaveProperty(key)
    })
  })
})
