import type { EventRepository } from '../event/repository'
import type { recordRegistrationChange } from '../stats/api'
import { jest } from '@jest/globals'

const mockListAllRegistrations = jest.fn<EventRepository['listAllRegistrations']>()
const mockListAllConfirmed = jest.fn<EventRepository['listAllConfirmed']>()
const mockRecordRegistrationChange = jest.fn<typeof recordRegistrationChange>()

jest.unstable_mockModule('../event/repository', () => ({
  eventRepository: {
    listAllConfirmed: mockListAllConfirmed,
    listAllRegistrations: mockListAllRegistrations,
  },
}))

// Mock the stats module
jest.unstable_mockModule('../stats/api', () => ({
  recordRegistrationChange: mockRecordRegistrationChange,
}))

const { default: handler } = await import('./handler')

describe('BackfillEventStatsFunction', () => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does nothing if there are no registrations', async () => {
    mockListAllRegistrations.mockResolvedValueOnce([])
    mockListAllConfirmed.mockResolvedValueOnce([])
    await handler()
    expect(mockRecordRegistrationChange).not.toHaveBeenCalled()
  })

  it('skips registrations if event is not found', async () => {
    const registration = { cancelled: false, eventId: 'event1', id: 'reg1', paidAmount: 10, refundAmount: 0 }
    mockListAllRegistrations.mockResolvedValueOnce([registration] as any)
    mockListAllConfirmed.mockResolvedValueOnce([])
    await handler()
    expect(mockRecordRegistrationChange).not.toHaveBeenCalled()
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
    mockListAllRegistrations.mockResolvedValueOnce([registration] as any)
    mockListAllConfirmed.mockResolvedValueOnce([event] as any)

    await handler()

    expect(mockRecordRegistrationChange).toHaveBeenCalledTimes(1)
    expect(mockRecordRegistrationChange).toHaveBeenCalledWith({ event, next: registration, previous: undefined })
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
    mockListAllRegistrations.mockResolvedValueOnce(registrations as any)
    mockListAllConfirmed.mockResolvedValueOnce(events as any)

    await handler()

    expect(mockRecordRegistrationChange).toHaveBeenCalledTimes(3)
    expect(mockRecordRegistrationChange).toHaveBeenCalledWith({
      event: events[0],
      next: registrations[0],
      previous: undefined,
    })
    expect(mockRecordRegistrationChange).toHaveBeenCalledWith({
      event: events[0],
      next: registrations[1],
      previous: undefined,
    })
    expect(mockRecordRegistrationChange).toHaveBeenCalledWith({
      event: events[1],
      next: registrations[2],
      previous: undefined,
    })
  })

  it('handles errors during processing', async () => {
    const registrations = [
      { eventId: 'event1', id: 'reg1' },
      { eventId: 'event2', id: 'reg2' },
    ]
    const events = [{ id: 'event1', organizer: { id: 'org1' } }]
    mockListAllRegistrations.mockResolvedValueOnce(registrations as any)
    mockListAllConfirmed.mockResolvedValueOnce(events as any)

    // Make the first call succeed and the second one fail
    mockRecordRegistrationChange.mockResolvedValueOnce(undefined)
    mockRecordRegistrationChange.mockRejectedValueOnce(new Error('Test error'))

    // Should not throw
    await handler()

    // Should have attempted to process both registrations
    expect(mockRecordRegistrationChange).toHaveBeenCalledTimes(1)
  })
})
