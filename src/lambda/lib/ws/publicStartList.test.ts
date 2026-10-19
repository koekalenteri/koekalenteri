import type { JsonDogEvent } from '../../../types'
import type { WebSocketConnection } from './types'
import { vi } from 'vitest'
import { asJsonConfirmedEvent, asJsonRegistration } from '../../test-utils/helpers'

const mockPublicStartListAudience = vi.fn()
const mockReadEventRegistrations = vi.fn()
const mockGetEvent = vi.fn()
const mockRemoveConnection = vi.fn()

type BroadcastArgs = {
  audience: () => Promise<WebSocketConnection[]>
  buildPayload: (audience: WebSocketConnection[], recipient: WebSocketConnection) => unknown
}

let sentPayload: unknown
const mockBroadcast = vi.fn(async ({ audience, buildPayload }: BroadcastArgs) => {
  const recipients = await audience()
  sentPayload = buildPayload(recipients, recipients[0])
  return { attempted: recipients.length, failed: 0, gone: 0, sent: recipients.length }
})

vi.doMock('./broadcast', () => ({ broadcast: mockBroadcast }))
vi.doMock('./connectionRepository', () => ({ removeConnection: mockRemoveConnection }))
vi.doMock('./connectionSelectors', () => ({ publicStartListAudience: mockPublicStartListAudience }))
vi.doMock('../repositories/registrationRepository', () => ({
  readEventRegistrations: mockReadEventRegistrations,
}))
vi.doMock('../event', () => ({ getEvent: mockGetEvent }))

const { buildPublicStartListPayload, publishPublicStartList } = await import('./publicStartList')

const publishedEvent = asJsonConfirmedEvent({
  classes: [{ class: 'ALO', state: 'invited' }],
  id: 'event-1',
  organizer: { id: 'org-1', name: 'Org' },
  startDate: '2025-01-01' as const,
  startListPublished: { ALO: true },
  startNumbersPublished: { ALO: true },
  state: 'invited',
})

const registration = (name: string, number: number) =>
  asJsonRegistration({
    cancelled: false,
    class: 'ALO',
    dog: { name, regNo: `REG-${number}` },
    eventId: 'event-1',
    group: { date: '2025-01-01' as const, key: 'ALO', number },
    handler: { name: 'Handler' },
    owner: { name: 'Owner' },
    startGroup: { date: '2025-01-01' as const, key: 'ALO', number },
  })

describe('ws/publicStartList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sentPayload = undefined
    mockPublicStartListAudience.mockResolvedValue([{ connectionId: 'reader' }])
    mockReadEventRegistrations.mockResolvedValue([registration('Aapo', 1)])
    mockGetEvent.mockResolvedValue(publishedEvent)
    vi.useFakeTimers({ now: new Date('2025-01-01T10:00:00.000Z'), toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends the published rows to the readers watching the event', async () => {
    await expect(publishPublicStartList('event-1')).resolves.toEqual({
      attempted: 1,
      failed: 0,
      gone: 0,
      sent: 1,
    })

    expect(mockReadEventRegistrations).toHaveBeenCalledWith('event-1', true)
    expect(sentPayload).toEqual({
      eventId: 'event-1',
      participants: [
        expect.objectContaining({
          class: 'ALO',
          dog: { name: 'Aapo', regNo: 'REG-1' },
          group: { date: '2025-01-01' as const, key: 'ALO', number: 1 },
          handler: 'Handler',
          owner: 'Owner',
        }),
      ],
      scope: 'public:start-list',
      version: Date.parse('2025-01-01T10:00:00.000Z'),
    })
  })

  it('composes the rows from what is stored, read consistently, not from a copy the caller holds (KOE-1516)', async () => {
    // A hide that landed while the sender was still working: the stored event already says so.
    mockGetEvent.mockResolvedValueOnce({ ...publishedEvent, startListPublished: { ALO: false } })

    await publishPublicStartList('event-1')

    expect(mockGetEvent).toHaveBeenCalledWith('event-1', true)
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    expect(sentPayload).toEqual({
      eventId: 'event-1',
      participants: [],
      scope: 'public:start-list',
      version: Date.parse('2025-01-01T10:00:00.000Z'),
    })
  })

  it('stamps the version before reading, so a later stamp never describes an earlier read (KOE-1516)', async () => {
    mockGetEvent.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date('2025-01-01T10:00:05.000Z'))
      return publishedEvent
    })

    await publishPublicStartList('event-1')

    expect(sentPayload).toEqual(expect.objectContaining({ version: Date.parse('2025-01-01T10:00:00.000Z') }))
  })

  it('costs nothing but the lookup when nobody is watching', async () => {
    mockPublicStartListAudience.mockResolvedValueOnce([])

    await expect(publishPublicStartList('event-1')).resolves.toEqual({
      attempted: 0,
      failed: 0,
      gone: 0,
      sent: 0,
    })

    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    expect(mockBroadcast).not.toHaveBeenCalled()
  })

  it('takes the rows away when the list is no longer available', async () => {
    const hidden: JsonDogEvent = { ...publishedEvent, startListPublished: { ALO: false } }
    mockGetEvent.mockResolvedValueOnce(hidden)

    await publishPublicStartList('event-1')

    expect(sentPayload).toEqual({
      eventId: 'event-1',
      participants: [],
      scope: 'public:start-list',
      version: Date.parse('2025-01-01T10:00:00.000Z'),
    })
  })

  it('asks for a fetch instead when the rows do not fit in one message', () => {
    const rows = Array.from({ length: 4000 }, (_, index) => ({
      breeder: 'Kasvattaja',
      class: 'ALO',
      dog: { name: `Koira ${index}`, regNo: `FI${index}/25` },
      group: { date: '2025-01-01' as const, key: 'ALO', number: index },
      handler: 'Ohjaaja',
      owner: 'Omistaja',
    }))

    expect(buildPublicStartListPayload('event-1', rows, 1234)).toEqual({
      eventId: 'event-1',
      scope: 'public:start-list',
      stale: true,
      version: 1234,
    })
  })
})
