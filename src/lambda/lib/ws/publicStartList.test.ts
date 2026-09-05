import type { JsonDogEvent } from '../../../types'
import type { WebSocketConnection } from './types'
import { vi } from 'vitest'
import { asJsonConfirmedEvent, asJsonRegistration } from '../../test-utils/helpers'

const mockPublicStartListAudience = vi.fn()
const mockGetRegistrationsByEventId = vi.fn()
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
vi.doMock('../registration', () => ({ getRegistrationsByEventId: mockGetRegistrationsByEventId }))

const { affectsPublicStartList, buildPublicStartListPayload, publishPublicStartList } = await import(
  './publicStartList'
)

const publishedEvent = asJsonConfirmedEvent({
  classes: [{ class: 'ALO', state: 'invited' }],
  id: 'event-1',
  organizer: { id: 'org-1', name: 'Org' },
  startDate: '2025-01-01',
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
    group: { date: '2025-01-01', key: 'ALO', number },
    handler: { name: 'Handler' },
    owner: { name: 'Owner' },
    startGroup: { date: '2025-01-01', key: 'ALO', number },
  })

describe('ws/publicStartList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sentPayload = undefined
    mockPublicStartListAudience.mockResolvedValue([{ connectionId: 'reader' }])
    mockGetRegistrationsByEventId.mockResolvedValue([registration('Aapo', 1)])
  })

  it('sends the published rows to the readers watching the event', async () => {
    await expect(publishPublicStartList(publishedEvent)).resolves.toEqual({
      attempted: 1,
      failed: 0,
      gone: 0,
      sent: 1,
    })

    expect(sentPayload).toEqual({
      eventId: 'event-1',
      participants: [
        expect.objectContaining({
          class: 'ALO',
          dog: { name: 'Aapo', regNo: 'REG-1' },
          group: { date: '2025-01-01', key: 'ALO', number: 1 },
          handler: 'Handler',
          owner: 'Owner',
        }),
      ],
      scope: 'public:start-list',
    })
  })

  it('costs nothing but the lookup when nobody is watching', async () => {
    mockPublicStartListAudience.mockResolvedValueOnce([])

    await expect(publishPublicStartList(publishedEvent)).resolves.toEqual({
      attempted: 0,
      failed: 0,
      gone: 0,
      sent: 0,
    })

    expect(mockGetRegistrationsByEventId).not.toHaveBeenCalled()
    expect(mockBroadcast).not.toHaveBeenCalled()
  })

  it('uses the registrations the caller already read', async () => {
    await publishPublicStartList(publishedEvent, [registration('Vieno', 2)])

    expect(mockGetRegistrationsByEventId).not.toHaveBeenCalled()
    expect(sentPayload).toEqual(
      expect.objectContaining({
        participants: [expect.objectContaining({ dog: { name: 'Vieno', regNo: 'REG-2' } })],
      })
    )
  })

  it('takes the rows away when the list is no longer available', async () => {
    const hidden: JsonDogEvent = { ...publishedEvent, startListPublished: { ALO: false } }

    await publishPublicStartList(hidden)

    expect(sentPayload).toEqual({ eventId: 'event-1', participants: [], scope: 'public:start-list' })
  })

  it('asks for a fetch instead when the rows do not fit in one message', () => {
    const rows = Array.from({ length: 4000 }, (_, index) => ({
      breeder: 'Kasvattaja',
      class: 'ALO',
      dog: { name: `Koira ${index}`, regNo: `FI${index}/25` },
      group: { date: '2025-01-01', key: 'ALO', number: index },
      handler: 'Ohjaaja',
      owner: 'Omistaja',
    }))

    expect(buildPublicStartListPayload('event-1', rows)).toEqual({
      eventId: 'event-1',
      scope: 'public:start-list',
      stale: true,
    })
  })

  it.each([
    [{ startListPublished: true }, true],
    [{ startNumbersPublished: { ALO: true } }, true],
    [{ resultsPublished: true }, true],
    [{ classes: [] }, true],
    [{ state: 'confirmed' }, true],
    [{ name: 'Uusi nimi' }, false],
    [{ description: 'Ajo-ohje' }, false],
  ])('tells whether %o changes the published start list', (patch, expected) => {
    expect(affectsPublicStartList(patch)).toBe(expected)
  })
})
