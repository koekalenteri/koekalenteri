import type {
  BreedStartRateEntry,
  CapacityStatsEntry,
  RetentionStats,
  YearlyBreakdownEntry,
  YearlyStatTypes,
  YearlyTotalStat,
} from '../../types/Stats'
import { vi } from 'vitest'

const mockResponse = vi.fn()

vi.doMock('../lib/lambda', () => ({
  lambda: vi.fn((_name, fn) => fn),
  response: mockResponse,
}))

// Mock the stats functions
const mockGetYearlyTotalStats = vi.fn<() => Promise<YearlyTotalStat[]>>()
const mockGetAvailableYears = vi.fn<() => Promise<number[]>>()
const mockGetDogHandlerBuckets = vi.fn<() => Promise<{ bucket: string; count: number }[]>>()
const mockGetDogsPerHandlerBuckets = vi.fn<() => Promise<{ bucket: string; count: number }[]>>()
const mockGetYearlyBreakdown = vi.fn<(year: number, type: YearlyStatTypes) => Promise<YearlyBreakdownEntry[]>>()
const mockGetBreedStartBreakdown = vi.fn<(year: number) => Promise<BreedStartRateEntry[]>>()
const mockGetRetentionStats = vi.fn<() => Promise<RetentionStats | undefined>>()
const mockGetCapacityStats =
  vi.fn<(eventType: string, organizerIds?: string[], from?: string, to?: string) => Promise<CapacityStatsEntry[]>>()
const mockGetCapacityStatsAllEventTypes = vi.fn<(from?: string, to?: string) => Promise<CapacityStatsEntry[]>>()

vi.doMock('../lib/stats', () => ({
  getAvailableYears: mockGetAvailableYears,
  getBreedStartBreakdown: mockGetBreedStartBreakdown,
  getCapacityStats: mockGetCapacityStats,
  getCapacityStatsAllEventTypes: mockGetCapacityStatsAllEventTypes,
  getDogHandlerBuckets: mockGetDogHandlerBuckets,
  getDogsPerHandlerBuckets: mockGetDogsPerHandlerBuckets,
  getRetentionStats: mockGetRetentionStats,
  getYearlyBreakdown: mockGetYearlyBreakdown,
  getYearlyTotalStats: mockGetYearlyTotalStats,
}))

const breakdownFor = (year: number, type: YearlyStatTypes): YearlyBreakdownEntry[] => [{ count: year, entityId: type }]

describe('GetStatsFunction', () => {
  let handler: any

  beforeEach(async () => {
    vi.clearAllMocks()
    // Import the handler after mocking dependencies
    const module = await import('./handler')
    handler = module.default

    // Default mock responses
    mockResponse.mockImplementation((status, body) => ({ body, status }))
    mockGetYearlyBreakdown.mockImplementation((year, type) => Promise.resolve(breakdownFor(year, type)))
    mockGetDogsPerHandlerBuckets.mockResolvedValue([])
    mockGetBreedStartBreakdown.mockResolvedValue([])
  })

  it('returns stats for a specific year when year parameter is provided', async () => {
    // Mock data
    const year = 2024
    const totals: YearlyTotalStat[] = [
      { count: 150, type: 'dog' as YearlyStatTypes, year },
      { count: 100, type: 'handler' as YearlyStatTypes, year },
    ]
    const dogHandlerBuckets = [
      { bucket: '1', count: 50 },
      { bucket: '2', count: 30 },
    ]
    const dogsPerHandlerBuckets = [
      { bucket: '1', count: 45 },
      { bucket: '2', count: 10 },
    ]
    const breedBreakdown = breakdownFor(year, 'breed')
    const eventTypeBreakdown = breakdownFor(year, 'eventType')
    const classBreakdown = breakdownFor(year, 'class')

    // Setup mocks
    mockGetYearlyTotalStats.mockResolvedValueOnce(totals)
    mockGetDogHandlerBuckets.mockResolvedValueOnce(dogHandlerBuckets)
    mockGetDogsPerHandlerBuckets.mockResolvedValueOnce(dogsPerHandlerBuckets)

    // Call handler with year parameter
    const event = { queryStringParameters: { year: '2024' } }
    const result = await handler(event)

    // Verify correct functions were called
    expect(mockGetYearlyTotalStats).toHaveBeenCalledWith(year)
    expect(mockGetDogHandlerBuckets).toHaveBeenCalledWith(year)
    expect(mockGetDogsPerHandlerBuckets).toHaveBeenCalledWith(year)
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(year, 'breed')
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(year, 'eventType')
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(year, 'class')
    expect(mockGetBreedStartBreakdown).toHaveBeenCalledWith(year)

    // Verify response
    const expectedBody = {
      breedBreakdown,
      breedStartBreakdown: [],
      classBreakdown,
      dogHandlerBuckets,
      dogsPerHandlerBuckets,
      eventTypeBreakdown,
      totals,
      year,
    }
    expect(mockResponse).toHaveBeenCalledWith(200, expectedBody, event, { maxAge: 300 })
    expect(result.body).toEqual(expectedBody)
  })

  it('returns stats for all available years when no year parameter is provided', async () => {
    // Mock data
    const years = [2023, 2024]
    const totals2023: YearlyTotalStat[] = [{ count: 100, type: 'dog' as YearlyStatTypes, year: 2023 }]
    const totals2024: YearlyTotalStat[] = [{ count: 150, type: 'dog' as YearlyStatTypes, year: 2024 }]
    const buckets2023 = [{ bucket: '1', count: 40 }]
    const buckets2024 = [{ bucket: '1', count: 50 }]

    // Setup mocks
    mockGetAvailableYears.mockResolvedValueOnce(years)
    mockGetYearlyTotalStats.mockResolvedValueOnce(totals2023)
    mockGetYearlyTotalStats.mockResolvedValueOnce(totals2024)
    mockGetDogHandlerBuckets.mockResolvedValueOnce(buckets2023)
    mockGetDogHandlerBuckets.mockResolvedValueOnce(buckets2024)

    // Call handler without year parameter
    const event = { queryStringParameters: {} }
    await handler(event)

    // Verify correct functions were called
    expect(mockGetAvailableYears).toHaveBeenCalled()
    expect(mockGetYearlyTotalStats).toHaveBeenCalledWith(2023)
    expect(mockGetYearlyTotalStats).toHaveBeenCalledWith(2024)
    expect(mockGetDogHandlerBuckets).toHaveBeenCalledWith(2023)
    expect(mockGetDogHandlerBuckets).toHaveBeenCalledWith(2024)
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(2023, 'breed')
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(2023, 'eventType')
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(2023, 'class')
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(2024, 'breed')
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(2024, 'eventType')
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(2024, 'class')

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        stats: [
          {
            breedBreakdown: breakdownFor(2023, 'breed'),
            breedStartBreakdown: [],
            classBreakdown: breakdownFor(2023, 'class'),
            dogHandlerBuckets: buckets2023,
            dogsPerHandlerBuckets: [],
            eventTypeBreakdown: breakdownFor(2023, 'eventType'),
            totals: totals2023,
            year: 2023,
          },
          {
            breedBreakdown: breakdownFor(2024, 'breed'),
            breedStartBreakdown: [],
            classBreakdown: breakdownFor(2024, 'class'),
            dogHandlerBuckets: buckets2024,
            dogsPerHandlerBuckets: [],
            eventTypeBreakdown: breakdownFor(2024, 'eventType'),
            totals: totals2024,
            year: 2024,
          },
        ],
        years,
      },
      event,
      { maxAge: 300 }
    )
  })

  it('handles invalid year parameter gracefully', async () => {
    // Mock data for the fallback to all years
    const years = [2023, 2024]
    const totals2023: YearlyTotalStat[] = [{ count: 100, type: 'dog' as YearlyStatTypes, year: 2023 }]
    const totals2024: YearlyTotalStat[] = [{ count: 150, type: 'dog' as YearlyStatTypes, year: 2024 }]
    const buckets2023 = [{ bucket: '1', count: 40 }]
    const buckets2024 = [{ bucket: '1', count: 50 }]

    // Setup mocks for the fallback path
    mockGetAvailableYears.mockResolvedValueOnce(years)
    mockGetYearlyTotalStats.mockResolvedValueOnce(totals2023)
    mockGetYearlyTotalStats.mockResolvedValueOnce(totals2024)
    mockGetDogHandlerBuckets.mockResolvedValueOnce(buckets2023)
    mockGetDogHandlerBuckets.mockResolvedValueOnce(buckets2024)

    // Call handler with invalid year parameter
    const event = { queryStringParameters: { year: 'invalid' } }
    const result = await handler(event)

    // Should fall back to getting all years
    expect(mockGetAvailableYears).toHaveBeenCalled()
    expect(mockGetYearlyTotalStats).toHaveBeenCalledWith(2023)
    expect(mockGetYearlyTotalStats).toHaveBeenCalledWith(2024)
    expect(mockGetDogHandlerBuckets).toHaveBeenCalledWith(2023)
    expect(mockGetDogHandlerBuckets).toHaveBeenCalledWith(2024)

    // Verify response structure
    expect(result.body).toEqual({
      stats: [
        {
          breedBreakdown: breakdownFor(2023, 'breed'),
          breedStartBreakdown: [],
          classBreakdown: breakdownFor(2023, 'class'),
          dogHandlerBuckets: buckets2023,
          dogsPerHandlerBuckets: [],
          eventTypeBreakdown: breakdownFor(2023, 'eventType'),
          totals: totals2023,
          year: 2023,
        },
        {
          breedBreakdown: breakdownFor(2024, 'breed'),
          breedStartBreakdown: [],
          classBreakdown: breakdownFor(2024, 'class'),
          dogHandlerBuckets: buckets2024,
          dogsPerHandlerBuckets: [],
          eventTypeBreakdown: breakdownFor(2024, 'eventType'),
          totals: totals2024,
          year: 2024,
        },
      ],
      years,
    })
  })

  it('includes capacityStats for the requested year when eventType is provided', async () => {
    const year = 2024
    mockGetYearlyTotalStats.mockResolvedValueOnce([])
    mockGetDogHandlerBuckets.mockResolvedValueOnce([])
    const capacityStats: CapacityStatsEntry[] = [
      {
        cancelledRegistrations: 1,
        class: 'ALO',
        eventCount: 2,
        eventType: 'NOME-B',
        month: '2024-06',
        organizerId: '',
        places: 20,
        reserve: 3,
        starters: 18,
      },
    ]
    mockGetCapacityStats.mockResolvedValueOnce(capacityStats)

    const event = { queryStringParameters: { eventType: 'NOME-B', from: '2024-01', to: '2024-12', year: '2024' } }
    const result = await handler(event)

    expect(mockGetCapacityStats).toHaveBeenCalledWith('NOME-B', undefined, '2024-01', '2024-12')
    expect(result.body).toEqual(
      expect.objectContaining({
        capacityStats,
        year,
      })
    )
  })

  it('aggregates across every event type when eventType is the ALL sentinel', async () => {
    const year = 2024
    mockGetYearlyTotalStats.mockResolvedValueOnce([])
    mockGetDogHandlerBuckets.mockResolvedValueOnce([])
    const capacityStats: CapacityStatsEntry[] = [
      {
        cancelledRegistrations: 0,
        class: 'ALO',
        eventCount: 1,
        eventType: 'NOME-A',
        month: '2024-06',
        organizerId: '',
        places: 20,
        reserve: 0,
        starters: 18,
      },
    ]
    mockGetCapacityStatsAllEventTypes.mockResolvedValueOnce(capacityStats)

    const event = { queryStringParameters: { eventType: 'ALL', from: '2024-01', to: '2024-12', year: '2024' } }
    const result = await handler(event)

    expect(mockGetCapacityStatsAllEventTypes).toHaveBeenCalledWith('2024-01', '2024-12')
    expect(mockGetCapacityStats).not.toHaveBeenCalled()
    expect(result.body).toEqual(expect.objectContaining({ capacityStats, year }))
  })

  it('includes retention for a year that has it', async () => {
    mockGetYearlyTotalStats.mockResolvedValueOnce([])
    mockGetDogHandlerBuckets.mockResolvedValueOnce([])
    mockGetRetentionStats.mockResolvedValueOnce({ new: 40, returning: 160, year: 2024 })

    const result = await handler({ queryStringParameters: { year: '2024' } })

    expect(result.body).toEqual(expect.objectContaining({ retention: { new: 40, returning: 160, year: 2024 } }))
  })

  it('omits retention entirely for the earliest year rather than sending zeros', async () => {
    mockGetYearlyTotalStats.mockResolvedValueOnce([])
    mockGetDogHandlerBuckets.mockResolvedValueOnce([])
    mockGetRetentionStats.mockResolvedValueOnce(undefined)

    const result = await handler({ queryStringParameters: { year: '2019' } })

    expect(result.body).not.toHaveProperty('retention')
  })

  it('ignores an organizerId query param so the unauthenticated route cannot leak one organizer', async () => {
    mockGetCapacityStats.mockResolvedValueOnce([])

    await handler({ queryStringParameters: { eventType: 'NOME-B', organizerId: 'org-1' } })

    expect(mockGetCapacityStats).toHaveBeenCalledWith('NOME-B', undefined, undefined, undefined)
  })

  it('returns capacityStats alone when eventType is provided without a year', async () => {
    const capacityStats: CapacityStatsEntry[] = [
      {
        cancelledRegistrations: 0,
        class: 'VOI',
        eventCount: 1,
        eventType: 'NOWT',
        month: '2024-03',
        organizerId: '',
        places: 10,
        reserve: 0,
        starters: 9,
      },
    ]
    mockGetCapacityStats.mockResolvedValueOnce(capacityStats)

    const event = { queryStringParameters: { eventType: 'NOWT' } }
    const result = await handler(event)

    expect(mockGetCapacityStats).toHaveBeenCalledWith('NOWT', undefined, undefined, undefined)
    expect(result.body).toEqual({ capacityStats })
    expect(mockResponse).toHaveBeenCalledWith(200, { capacityStats }, event, { maxAge: 3600 })
    // The caller discards the yearly aggregates, so they must not be computed at all.
    expect(mockGetAvailableYears).not.toHaveBeenCalled()
    expect(mockGetYearlyTotalStats).not.toHaveBeenCalled()
    expect(mockGetDogHandlerBuckets).not.toHaveBeenCalled()
    expect(mockGetDogsPerHandlerBuckets).not.toHaveBeenCalled()
    expect(mockGetYearlyBreakdown).not.toHaveBeenCalled()
    expect(mockGetBreedStartBreakdown).not.toHaveBeenCalled()
  })

  it('fetches the years in parallel rather than one after another', async () => {
    mockGetAvailableYears.mockResolvedValueOnce([2022, 2023, 2024])
    let inFlight = 0
    let maxInFlight = 0
    mockGetYearlyTotalStats.mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight--
      return []
    })
    mockGetDogHandlerBuckets.mockResolvedValue([])

    const result = await handler({ queryStringParameters: {} })

    expect(result.body.stats.map((stats: { year: number }) => stats.year)).toEqual([2022, 2023, 2024])
    expect(maxInFlight).toBe(3)
  })

  it('omits capacityStats when eventType is not provided', async () => {
    mockGetAvailableYears.mockResolvedValueOnce([])

    const event = { queryStringParameters: {} }
    const result = await handler(event)

    expect(mockGetCapacityStats).not.toHaveBeenCalled()
    expect(result.body.capacityStats).toBeUndefined()
  })
})
