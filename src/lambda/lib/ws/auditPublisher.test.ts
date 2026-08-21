import { vi } from 'vitest'

let broadcastConfiguration: unknown
const mockBroadcast = vi.fn((configuration: unknown) => {
  broadcastConfiguration = configuration
  return Promise.resolve({ attempted: 0, failed: 0, gone: 0, sent: 0 })
})
const mockRemoveConnection = vi.fn()
const mockEventSubscriberAudience = vi.fn().mockResolvedValue([])

vi.doMock('./broadcast', () => ({ broadcast: mockBroadcast }))
vi.doMock('./connectionRepository', () => ({ removeConnection: mockRemoveConnection }))
vi.doMock('./connectionSelectors', () => ({ eventSubscriberAudience: mockEventSubscriberAudience }))

const { publishAuditRecord } = await import('./auditPublisher')

describe('ws/auditPublisher', () => {
  beforeEach(() => {
    broadcastConfiguration = undefined
    vi.clearAllMocks()
  })

  it.each([
    ['event:event-1', 'event-1'],
    ['event-1:registration-1', 'event-1'],
  ])('publishes %s to subscribers of %s', async (auditKey, eventId) => {
    const record = { auditKey, message: 'changed', timestamp: '2026-07-14T12:00:00.000Z', user: 'admin' }

    await publishAuditRecord(record)

    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ audience: expect.any(Function), buildPayload: expect.any(Function) })
    )
    const call = broadcastConfiguration as {
      audience: () => Promise<unknown[]>
      buildPayload: () => unknown
    }
    await call.audience()
    expect(mockEventSubscriberAudience).toHaveBeenCalledWith(eventId)
    expect(call.buildPayload()).toEqual({ eventId, record, scope: 'admin:audit-record' })
  })
})
