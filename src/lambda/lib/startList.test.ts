import { vi } from 'vitest'
import { asJsonConfirmedEvent, asJsonRegistration } from '../test-utils/helpers'

const mockGetEvent = vi.fn()
const mockGetRegistrationsByEventId = vi.fn()

vi.doMock('./event', () => ({ getEvent: mockGetEvent }))
vi.doMock('./registration', () => ({ getRegistrationsByEventId: mockGetRegistrationsByEventId }))

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
    mockGetEvent.mockResolvedValue(publishedEvent)
    mockGetRegistrationsByEventId.mockResolvedValue([registration])
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

    expect(mockGetEvent).toHaveBeenCalledWith('event-1', true)
    expect(mockGetRegistrationsByEventId).toHaveBeenCalledWith('event-1', true)
  })

  it('stamps the version before reading, so a later stamp never describes an earlier read', async () => {
    mockGetEvent.mockImplementationOnce(async () => {
      vi.setSystemTime(STAMP + 5000)
      return publishedEvent
    })

    await expect(readPublishedStartList('event-1')).resolves.toEqual(expect.objectContaining({ version: STAMP }))
  })

  it('reads a list that is not available as no rows, without reading the registrations', async () => {
    mockGetEvent.mockResolvedValueOnce({ ...publishedEvent, startListPublished: { ALO: false } })

    await expect(readPublishedStartList('event-1')).resolves.toEqual({
      available: false,
      participants: [],
      version: STAMP,
    })
    expect(mockGetRegistrationsByEventId).not.toHaveBeenCalled()
  })

  it('composes an unpublished list for a preview', async () => {
    mockGetEvent.mockResolvedValueOnce({ ...publishedEvent, startListPublished: { ALO: false } })

    await expect(readPublishedStartList('event-1', { preview: true })).resolves.toEqual(
      expect.objectContaining({ available: true, participants: [expect.objectContaining({ handler: 'Handler' })] })
    )
  })

  it('lets the caller refuse the event before any registration is read', async () => {
    const checkEvent = vi.fn(() => {
      throw new Error('Forbidden')
    })

    await expect(readPublishedStartList('event-1', { checkEvent })).rejects.toThrow('Forbidden')

    expect(checkEvent).toHaveBeenCalledWith(publishedEvent)
    expect(mockGetRegistrationsByEventId).not.toHaveBeenCalled()
  })
})
