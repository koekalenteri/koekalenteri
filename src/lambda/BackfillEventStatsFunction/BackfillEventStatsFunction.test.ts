import type CustomDynamoClient from '../utils/CustomDynamoClient'
import { jest } from '@jest/globals'

const mockBatchWrite = jest.fn<CustomDynamoClient['batchWrite']>()
const mockDelete = jest.fn<CustomDynamoClient['delete']>()
const mockReadAll = jest.fn<CustomDynamoClient['readAll']>()

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: class {
    batchWrite = mockBatchWrite
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

const { buildStatsRecords, createHandler, getEventStatsRecordYear } = await import('./handler')
const handler = createHandler()

const event = (id: string, startDate: string, eventType = 'NOU') => ({
  eventType,
  id,
  organizer: { id: `organizer-${id}` },
  startDate,
})

const registration = (id: string, eventId: string, overrides = {}) => ({
  cancelled: false,
  eventId,
  eventType: 'NOU',
  id,
  paidAmount: 0,
  refundAmount: 0,
  ...overrides,
})

describe('BackfillEventStatsFunction', () => {
  const mockLog = jest.spyOn(console, 'log').mockImplementation(() => undefined)

  beforeEach(() => {
    jest.clearAllMocks()
    mockDelete.mockResolvedValue(true)
    mockBatchWrite.mockResolvedValue(undefined)
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
    expect(mockBatchWrite).not.toHaveBeenCalled()
  })

  it('calculates final stats once, then clears and bulk writes each year in ascending order', async () => {
    const event2025 = event('event-2025', '2025-05-01')
    const event2026 = event('event-2026', '2026-05-01', 'other')
    const registration2025 = registration('registration-2025', event2025.id, {
      cancelled: true,
      dog: { breedCode: 'LAB', regNo: 'FI123' },
      handler: { email: 'handler@example.com' },
      owner: { email: 'owner@example.com' },
      paidAmount: 30,
      refundAmount: 5,
    })
    const registration2026 = registration('registration-2026', event2026.id, { paidAmount: 20 })
    const stats = [
      { PK: 'TOTALS#2025', SK: 'dog' },
      { PK: 'TOTALS#2024', SK: 'dog' },
    ]
    mockReadAll
      .mockResolvedValueOnce([event2026, event2025])
      .mockResolvedValueOnce([registration2026, registration2025])
      .mockResolvedValueOnce(stats)

    await handler()

    expect(mockReadAll).toHaveBeenNthCalledWith(1, {
      projection: 'id, organizer, startDate, eventType',
      table: 'event-table',
    })
    expect(mockReadAll).toHaveBeenNthCalledWith(2, {
      names: { '#handler': 'handler', '#owner': 'owner' },
      projection:
        'eventId, id, cancelled, paidAmount, refundAmount, eventType, dog.regNo, dog.breedCode, #handler.email, #owner.email',
      table: 'registration-table',
    })
    expect(mockReadAll).toHaveBeenNthCalledWith(3, { projection: 'PK, SK' })
    expect(mockDelete).toHaveBeenNthCalledWith(1, stats[1])
    expect(mockDelete).toHaveBeenNthCalledWith(2, stats[0])
    expect(mockBatchWrite).toHaveBeenCalledTimes(2)
    expect(mockBatchWrite).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          cancelledRegistrations: 1,
          count: 1,
          PK: 'ORG#organizer-event-2025',
          paidAmount: 30,
          paidRegistrations: 1,
          refundedAmount: 5,
          refundedRegistrations: 1,
          SK: '2025-05-01#event-2025',
        }),
        { count: 1, PK: 'TOTALS#2025', SK: 'dog' },
        { count: 1, PK: 'BUCKETS#2025#dog#handler', SK: '1' },
        expect.objectContaining({ PK: 'YEARS', SK: '2025' }),
      ])
    )
    expect(mockBatchWrite).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([
        expect.objectContaining({ count: 1, PK: 'ORG#organizer-event-2026', SK: '2026-05-01#event-2026' }),
        expect.objectContaining({ PK: 'YEARS', SK: '2026' }),
      ])
    )
  })

  it('counts repeated participants and derives unique totals and dog-handler buckets', () => {
    const testEvent = event('event-2025', '2025-05-01')
    const { records, skippedCount } = buildStatsRecords(
      [
        registration('one', testEvent.id, { dog: { regNo: 'FI1' }, handler: { email: 'a@example.com' } }),
        registration('two', testEvent.id, { dog: { regNo: 'FI1' }, handler: { email: 'a@example.com' } }),
        registration('three', testEvent.id, { dog: { regNo: 'FI2' }, handler: { email: 'b@example.com' } }),
      ],
      new Map([[testEvent.id, testEvent]]),
      '2025-01-01T00:00:00.000Z'
    )

    expect(skippedCount).toBe(0)
    expect(records).toEqual(
      expect.arrayContaining([
        { count: 2, PK: 'TOTALS#2025', SK: 'dog' },
        { count: 2, PK: 'TOTALS#2025', SK: 'dog#handler' },
        { count: 1, PK: 'BUCKETS#2025#dog#handler', SK: '1' },
        { count: 1, PK: 'BUCKETS#2025#dog#handler', SK: '2' },
      ])
    )
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
    expect(mockBatchWrite).not.toHaveBeenCalled()
    expect(mockLog).toHaveBeenLastCalledWith(
      'Event stats regeneration completed. Records: 0, Skipped: 2, Unclassified stats: 0'
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
      'Event stats regeneration completed. Records: 0, Skipped: 0, Unclassified stats: 1'
    )
  })

  it('fails instead of reporting success when cleanup fails', async () => {
    mockReadAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ PK: 'TOTALS#2025', SK: 'dog' }])
    mockDelete.mockResolvedValueOnce(false)

    await expect(handler()).rejects.toThrow('Failed to delete stats record TOTALS#2025/dog')
    expect(mockBatchWrite).not.toHaveBeenCalled()
  })
})
