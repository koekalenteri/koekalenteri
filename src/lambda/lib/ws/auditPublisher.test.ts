import { jest } from '@jest/globals'

const mockBroadcast = jest.fn<any>().mockResolvedValue({ attempted: 0, failed: 0, gone: 0, sent: 0 })
const mockRemoveConnection = jest.fn<any>()
const mockEventSubscriberAudience = jest.fn<any>().mockResolvedValue([])

jest.unstable_mockModule('./broadcast', () => ({ broadcast: mockBroadcast }))
jest.unstable_mockModule('./connectionRepository', () => ({ removeConnection: mockRemoveConnection }))
jest.unstable_mockModule('./connectionSelectors', () => ({ eventSubscriberAudience: mockEventSubscriberAudience }))

const { publishAuditRecord } = await import('./auditPublisher')

describe('ws/auditPublisher', () => {
  beforeEach(() => jest.clearAllMocks())

  it.each([
    ['event:event-1', 'event-1'],
    ['event-1:registration-1', 'event-1'],
  ])('publishes %s to subscribers of %s', async (auditKey, eventId) => {
    const record = { auditKey, message: 'changed', timestamp: '2026-07-14T12:00:00.000Z', user: 'admin' }

    await publishAuditRecord(record)

    const call = mockBroadcast.mock.calls[0]?.[0] as {
      audience: () => Promise<unknown[]>
      buildPayload: () => unknown
    }
    await call.audience()
    expect(mockEventSubscriberAudience).toHaveBeenCalledWith(eventId)
    expect(call.buildPayload()).toEqual({ eventId, record, scope: 'admin:audit-record' })
  })
})
