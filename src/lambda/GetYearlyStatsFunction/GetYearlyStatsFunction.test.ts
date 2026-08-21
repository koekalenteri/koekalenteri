import type { YearlyBreakdownEntry, YearlyStatTypes, YearlyTotalStat } from '../../types/Stats'
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
const mockGetYearlyBreakdown = vi.fn<(year: number, type: YearlyStatTypes) => Promise<YearlyBreakdownEntry[]>>()

vi.doMock('../lib/stats', () => ({
  getAvailableYears: mockGetAvailableYears,
  getDogHandlerBuckets: mockGetDogHandlerBuckets,
  getYearlyBreakdown: mockGetYearlyBreakdown,
  getYearlyTotalStats: mockGetYearlyTotalStats,
}))

const breakdownFor = (year: number, type: YearlyStatTypes): YearlyBreakdownEntry[] => [{ count: year, entityId: type }]

describe('GetYearlyStatsFunction', () => {
  let handler: any

  beforeEach(async () => {
    vi.clearAllMocks()
    // Import the handler after mocking dependencies
    const module = await import('./handler')
    handler = module.default

    // Default mock responses
    mockResponse.mockImplementation((status, body) => ({ body, status }))
    mockGetYearlyBreakdown.mockImplementation((year, type) => Promise.resolve(breakdownFor(year, type)))
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
    const breedBreakdown = breakdownFor(year, 'breed')
    const eventTypeBreakdown = breakdownFor(year, 'eventType')

    // Setup mocks
    mockGetYearlyTotalStats.mockResolvedValueOnce(totals)
    mockGetDogHandlerBuckets.mockResolvedValueOnce(dogHandlerBuckets)

    // Call handler with year parameter
    const event = { queryStringParameters: { year: '2024' } }
    const result = await handler(event)

    // Verify correct functions were called
    expect(mockGetYearlyTotalStats).toHaveBeenCalledWith(year)
    expect(mockGetDogHandlerBuckets).toHaveBeenCalledWith(year)
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(year, 'breed')
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(year, 'eventType')

    // Verify response
    const expectedBody = { breedBreakdown, dogHandlerBuckets, eventTypeBreakdown, totals, year }
    expect(mockResponse).toHaveBeenCalledWith(200, expectedBody, event)
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
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(2024, 'breed')
    expect(mockGetYearlyBreakdown).toHaveBeenCalledWith(2024, 'eventType')

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        stats: [
          {
            breedBreakdown: breakdownFor(2023, 'breed'),
            dogHandlerBuckets: buckets2023,
            eventTypeBreakdown: breakdownFor(2023, 'eventType'),
            totals: totals2023,
            year: 2023,
          },
          {
            breedBreakdown: breakdownFor(2024, 'breed'),
            dogHandlerBuckets: buckets2024,
            eventTypeBreakdown: breakdownFor(2024, 'eventType'),
            totals: totals2024,
            year: 2024,
          },
        ],
        years,
      },
      event
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
          dogHandlerBuckets: buckets2023,
          eventTypeBreakdown: breakdownFor(2023, 'eventType'),
          totals: totals2023,
          year: 2023,
        },
        {
          breedBreakdown: breakdownFor(2024, 'breed'),
          dogHandlerBuckets: buckets2024,
          eventTypeBreakdown: breakdownFor(2024, 'eventType'),
          totals: totals2024,
          year: 2024,
        },
      ],
      years,
    })
  })
})
