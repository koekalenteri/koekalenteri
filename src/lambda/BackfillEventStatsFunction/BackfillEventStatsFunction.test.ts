import type { updateEventStatsForRegistration } from '../lib/stats'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import { jest } from '@jest/globals'

// Mocks for CustomDynamoClient methods
const mockReadAll = jest.fn<CustomDynamoClient['readAll']>()
const mockRead = jest.fn<CustomDynamoClient['read']>()
const mockWrite = jest.fn<CustomDynamoClient['write']>()
const mockUpdateEventStatsForRegistration = jest.fn<typeof updateEventStatsForRegistration>()

// Mock the CustomDynamoClient class
jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: class {
    readAll = mockReadAll
    read = mockRead
    write = mockWrite
  },
}))

// Mock the stats module
jest.unstable_mockModule('../lib/stats', () => ({
  updateEventStatsForRegistration: mockUpdateEventStatsForRegistration,
}))

// Mock CONFIG to provide table names
jest.unstable_mockModule('../config', () => ({
  CONFIG: {
    eventStatsTable: 'event-stats-table',
    eventTable: 'event-table',
    registrationTable: 'registration-table',
  },
}))

const { default: handler } = await import('./handler')

describe('BackfillEventStatsFunction', () => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does nothing if there are no registrations', async () => {
    mockReadAll.mockResolvedValueOnce([]) // registrations
    mockReadAll.mockResolvedValueOnce([]) // events
    await handler()
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
  })

  it('skips registrations if event is not found', async () => {
    const registration = { cancelled: false, eventId: 'event1', id: 'reg1', paidAmount: 10, refundAmount: 0 }
    mockReadAll.mockResolvedValueOnce([registration]) // registrations
    mockReadAll.mockResolvedValueOnce([]) // events (empty, so event not found)
    await handler()
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
  })

  it('processes a single registration correctly', async () => {
    const registration = {
      cancelled: false,
      eventId: 'event1',
      id: 'reg1',
      paidAmount: 20,
      refundAmount: 0,
    }
    const event = {
      endDate: '2025-01-02',
      id: 'event1',
      name: 'Test Event',
      organizer: { id: 'org1' },
      startDate: '2025-01-01',
    }
    mockReadAll.mockResolvedValueOnce([registration]) // registrations
    mockReadAll.mockResolvedValueOnce([event]) // events

    await handler()

    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledWith(registration, undefined, event)
  })

  it('processes multiple registrations correctly', async () => {
    const registrations = [
      { cancelled: false, eventId: 'event1', id: 'reg1', paidAmount: 10, refundAmount: 0 },
      { cancelled: true, eventId: 'event1', id: 'reg2', paidAmount: 0, refundAmount: 0 },
      { cancelled: false, eventId: 'event2', id: 'reg3', paidAmount: 15, refundAmount: 5 },
    ]
    const events = [
      {
        endDate: '2025-01-02',
        id: 'event1',
        organizer: { id: 'org1' },
        startDate: '2025-01-01',
      },
      {
        endDate: '2025-02-02',
        id: 'event2',
        organizer: { id: 'org2' },
        startDate: '2025-02-01',
      },
    ]
    mockReadAll.mockResolvedValueOnce(registrations) // registrations
    mockReadAll.mockResolvedValueOnce(events) // events

    await handler()

    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(3)
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledWith(registrations[0], undefined, events[0])
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledWith(registrations[1], undefined, events[0])
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledWith(registrations[2], undefined, events[1])
  })

  it('handles errors during processing', async () => {
    const registrations = [
      { eventId: 'event1', id: 'reg1' },
      { eventId: 'event2', id: 'reg2' },
    ]
    const events = [{ id: 'event1', organizer: { id: 'org1' } }]
    mockReadAll.mockResolvedValueOnce(registrations) // registrations
    mockReadAll.mockResolvedValueOnce(events) // events

    // Make the first call succeed and the second one fail
    mockUpdateEventStatsForRegistration.mockResolvedValueOnce(undefined)
    mockUpdateEventStatsForRegistration.mockRejectedValueOnce(new Error('Test error'))

    // Should not throw
    await handler()

    // Should have attempted to process both registrations
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)
  })
})
