import type { updateEventStatsForRegistration } from '../lib/stats'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import { jest } from '@jest/globals'

const mockDelete = jest.fn<CustomDynamoClient['delete']>()
const mockReadAll = jest.fn<CustomDynamoClient['readAll']>()
const mockUpdateEventStatsForRegistration = jest.fn<typeof updateEventStatsForRegistration>()

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: class {
    delete = mockDelete
    readAll = mockReadAll
  },
}))

jest.unstable_mockModule('../config', () => ({
  CONFIG: {
    eventStatsTable: 'event-stats-table',
    eventTable: 'event-table',
    registrationTable: 'registration-table',
  },
}))

const { createHandler, getEventStatsRecordYear } = await import('./handler')
const handler = createHandler(mockUpdateEventStatsForRegistration)

const event = (id: string, startDate: string) => ({
  id,
  organizer: { id: `organizer-${id}` },
  startDate,
})

const registration = (id: string, eventId: string) => ({ eventId, id })

describe('BackfillEventStatsFunction', () => {
  const mockLog = jest.spyOn(console, 'log').mockImplementation(() => undefined)

  beforeEach(() => {
    jest.clearAllMocks()
    mockDelete.mockResolvedValue(true)
  })

  it.each([
    [{ PK: 'ORG#organizer', SK: '2025-05-01#event' }, 2025],
    [{ PK: 'ORG#organizer', SK: '2025-05-01#event#copy' }, 2025],
    [{ PK: 'ORG#organizer', SK: '2025-12-31T23:30:00Z#event' }, 2026],
    [{ PK: 'YEARS', SK: '2025' }, 2025],
    [{ PK: 'STAT#2025#dog#handler', SK: 'id' }, 2025],
    [{ PK: 'TOTALS#2025', SK: 'dog' }, 2025],
    [{ PK: 'BUCKETS#2025#dog#handler', SK: '0-1' }, 2025],
    [{ PK: 'OTHER#2025', SK: 'id' }, undefined],
    [{ PK: 'YEARS', SK: 'not-a-year' }, undefined],
    [{ PK: 'ORG#organizer', SK: 'not-a-date#event' }, undefined],
  ])('extracts stats year from %o', (key, expected) => {
    expect(getEventStatsRecordYear(key)).toBe(expected)
  })

  it('does nothing when events, registrations, and stats are all absent', async () => {
    mockReadAll.mockResolvedValue([])

    await handler()

    expect(mockReadAll).toHaveBeenCalledTimes(3)
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
  })

  it('clears live and orphaned years with one stats-table scan, then replays by ascending year', async () => {
    const event2025 = event('event-2025', '2025-05-01')
    const event2026 = event('event-2026', '2026-05-01')
    const registration2025 = registration('registration-2025', event2025.id)
    const registration2026 = registration('registration-2026', event2026.id)
    const stats = [
      { PK: 'STAT#2025#dog#handler', SK: 'dog' },
      { PK: 'TOTALS#2025', SK: 'dog' },
      { PK: 'BUCKETS#2025#dog#handler', SK: '0-1' },
      { PK: 'YEARS', SK: '2025' },
      { PK: 'ORG#organizer', SK: '2025-05-01#event-2025' },
      { PK: 'TOTALS#2024', SK: 'dog' },
    ]
    mockReadAll
      .mockResolvedValueOnce([event2026, event2025])
      .mockResolvedValueOnce([registration2026, registration2025])
      .mockResolvedValueOnce(stats)

    await handler()

    expect(mockReadAll).toHaveBeenCalledTimes(3)
    expect(mockReadAll).toHaveBeenNthCalledWith(1, { table: 'event-table' })
    expect(mockReadAll).toHaveBeenNthCalledWith(2, {
      names: { '#handler': 'handler', '#owner': 'owner' },
      projection:
        'eventId, id, cancelled, paidAmount, refundAmount, eventType, dog.regNo, dog.breedCode, #handler.email, #owner.email',
      table: 'registration-table',
    })
    expect(mockReadAll).toHaveBeenNthCalledWith(3, { projection: 'PK, SK' })
    expect(mockDelete).toHaveBeenCalledTimes(stats.length)
    for (const stat of stats) expect(mockDelete).toHaveBeenCalledWith(stat)
    expect(mockUpdateEventStatsForRegistration).toHaveBeenNthCalledWith(1, registration2025, undefined, event2025)
    expect(mockUpdateEventStatsForRegistration).toHaveBeenNthCalledWith(2, registration2026, undefined, event2026)
  })

  it('clears a discovered year even when it has no registrations', async () => {
    mockReadAll
      .mockResolvedValueOnce([event('event-2025', '2025-05-01')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ PK: 'YEARS', SK: '2025' }])

    await handler()

    expect(mockDelete).toHaveBeenCalledWith({ PK: 'YEARS', SK: '2025' })
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
  })

  it('skips registrations whose events are missing or have invalid start dates', async () => {
    const invalidEvent = event('invalid-event', 'not-a-date')
    mockReadAll
      .mockResolvedValueOnce([invalidEvent])
      .mockResolvedValueOnce([
        registration('missing-registration', 'missing-event'),
        registration('invalid-registration', invalidEvent.id),
      ])
      .mockResolvedValueOnce([])

    await handler()

    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
    expect(mockLog).toHaveBeenLastCalledWith(
      'Event stats regeneration completed. Years: 0, Skipped: 2, Unclassified stats: 0'
    )
  })

  it('reports stats records that cannot be assigned to a year', async () => {
    mockReadAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ PK: 'NEW_STAT_FAMILY#2025', SK: 'id' }])

    await handler()

    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockLog).toHaveBeenLastCalledWith(
      'Event stats regeneration completed. Years: 0, Skipped: 0, Unclassified stats: 1'
    )
  })

  it('fails instead of reporting success when year cleanup fails', async () => {
    mockReadAll
      .mockResolvedValueOnce([event('event-2025', '2025-05-01')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ PK: 'TOTALS#2025', SK: 'dog' }])
    mockDelete.mockResolvedValueOnce(false)

    await expect(handler()).rejects.toThrow('Failed to delete stats record TOTALS#2025/dog')
    expect(mockUpdateEventStatsForRegistration).not.toHaveBeenCalled()
  })

  it('fails when replaying a registration fails', async () => {
    const testEvent = event('event-2025', '2025-05-01')
    const testRegistration = registration('registration-2025', testEvent.id)
    mockReadAll.mockResolvedValueOnce([testEvent]).mockResolvedValueOnce([testRegistration]).mockResolvedValueOnce([])
    mockUpdateEventStatsForRegistration.mockRejectedValueOnce(new Error('Write failed'))

    await expect(handler()).rejects.toThrow('Write failed')
  })
})
