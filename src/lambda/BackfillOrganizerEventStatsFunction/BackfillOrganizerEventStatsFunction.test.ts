import type CustomDynamoClient from '../utils/CustomDynamoClient'

import { jest } from '@jest/globals'

// Mocks for CustomDynamoClient methods
const mockReadAll = jest.fn<CustomDynamoClient['readAll']>()
const mockRead = jest.fn<CustomDynamoClient['read']>()
const mockWrite = jest.fn<CustomDynamoClient['write']>()

// Mock the CustomDynamoClient class
jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: class {
    readAll = mockReadAll
    read = mockRead
    write = mockWrite
  },
}))

// Mock CONFIG to provide table names
jest.unstable_mockModule('../config', () => ({
  CONFIG: {
    eventTable: 'event-table',
    registrationTable: 'registration-table',
    organizerEventStatsTable: 'organizer-event-stats-table',
  },
}))

const { default: handler } = await import('./handler')

describe('BackfillOrganizerEventStatsFunction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does nothing if there are no registrations', async () => {
    mockReadAll.mockResolvedValueOnce([])
    await handler()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('skips registrations if event is not found', async () => {
    mockReadAll.mockResolvedValueOnce([{ eventId: 'event1', paidAmount: 10, cancelled: false, refundAmount: 0 }])
    mockRead.mockResolvedValueOnce(undefined) // event not found
    await handler()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('writes correct stats for a single paid registration', async () => {
    const registration = {
      eventId: 'event1',
      paidAmount: 20,
      cancelled: false,
      refundAmount: 0,
    }
    const event = {
      id: 'event1',
      name: 'Test Event',
      startDate: '2025-01-01',
      endDate: '2025-01-02',
      organizer: { id: 'org1' },
    }
    mockReadAll.mockResolvedValueOnce([registration])
    mockRead.mockResolvedValueOnce(event)
    await handler()
    expect(mockWrite).toHaveBeenCalledTimes(1)
    const stats = mockWrite.mock.calls[0][0]
    expect(stats).toMatchObject({
      organizerId: 'org1',
      eventId: 'event1',
      eventName: 'Test Event',
      eventStartDate: '2025-01-01',
      eventEndDate: '2025-01-02',
      totalRegistrations: 1,
      paidRegistrations: 1,
      cancelledRegistrations: 0,
      refundedRegistrations: 0,
      paidAmount: 20,
      refundedAmount: 0,
    })
    expect(typeof (stats as any).updatedAt).toBe('string')
  })

  it('aggregates stats for multiple registrations and refunds', async () => {
    const registrations = [
      { eventId: 'event1', paidAmount: 10, cancelled: false, refundAmount: 0 },
      { eventId: 'event1', paidAmount: 0, cancelled: true, refundAmount: 0 },
      { eventId: 'event1', paidAmount: 15, cancelled: false, refundAmount: 5 },
    ]
    const event = {
      id: 'event1',
      name: 'Test Event',
      startDate: '2025-01-01',
      endDate: '2025-01-02',
      organizer: { id: 'org1' },
    }
    mockReadAll.mockResolvedValueOnce(registrations)
    mockRead.mockResolvedValue(event)
    await handler()
    expect(mockWrite).toHaveBeenCalledTimes(1)
    const stats = mockWrite.mock.calls[0][0]
    expect(stats).toMatchObject({
      organizerId: 'org1',
      eventId: 'event1',
      eventName: 'Test Event',
      eventStartDate: '2025-01-01',
      eventEndDate: '2025-01-02',
      totalRegistrations: 3,
      paidRegistrations: 2,
      cancelledRegistrations: 1,
      refundedRegistrations: 1,
      paidAmount: 25,
      refundedAmount: 5,
    })
  })
})
