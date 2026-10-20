import { vi } from 'vitest'
import { asJsonConfirmedEvent, asJsonRegistration, deletedEvent, eventNotFound } from '../test-utils/helpers'

const mockGetEvent = vi.fn()
const mockGetLiveEvent = vi.fn()
const mockReadEventRegistrations = vi.fn()

vi.doMock('./event', () => ({ getEvent: mockGetEvent, getLiveEvent: mockGetLiveEvent }))
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
    mockGetEvent.mockResolvedValueOnce({ ...publishedEvent, startListPublished: { ALO: false } })

    await expect(readPublishedStartList('event-1', { preview: true })).resolves.toEqual(
      expect.objectContaining({ available: true, participants: [expect.objectContaining({ handler: 'Handler' })] })
    )
    expect(mockGetEvent).toHaveBeenCalledWith('event-1', true)
    expect(mockGetLiveEvent).not.toHaveBeenCalled()
  })

  // KOE-1586: the public list of a deleted event was still served.
  it('answers a deleted event as a missing one, without reading the registrations', async () => {
    mockGetEvent.mockResolvedValue(deletedEvent(publishedEvent))
    mockGetLiveEvent.mockRejectedValueOnce(eventNotFound('event-1'))

    await expect(readPublishedStartList('event-1')).rejects.toMatchObject({ status: 404 })

    expect(mockGetLiveEvent).toHaveBeenCalledWith('event-1', true)
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
  })

  it("previews a deleted event's list for its organizer", async () => {
    mockGetEvent.mockResolvedValueOnce(deletedEvent(publishedEvent))

    await expect(readPublishedStartList('event-1', { preview: true })).resolves.toEqual(
      expect.objectContaining({ available: true })
    )
  })

  it('lets the caller refuse the event before any registration is read', async () => {
    const checkEvent = vi.fn(() => {
      throw new Error('Forbidden')
    })

    await expect(readPublishedStartList('event-1', { checkEvent })).rejects.toThrow('Forbidden')

    expect(checkEvent).toHaveBeenCalledWith(publishedEvent)
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
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

    it('withholds the rank where the results are not published', async () => {
      mockGetLiveEvent.mockResolvedValue({ ...resultsEvent, resultsPublished: { ALO: false } })
      mockReadEventRegistrations.mockResolvedValue([scored('a', 'ALO1', 90)])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toHaveLength(1)
      expect(participants[0]).not.toHaveProperty('placement')
    })
  })
})
