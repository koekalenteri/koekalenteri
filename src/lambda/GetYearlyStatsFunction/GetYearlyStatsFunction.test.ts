import type { YearlyStatTypes, YearlyTotalStat } from '../../types/Stats'
import { jest } from '@jest/globals'

const mockResponse = jest.fn()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: jest.fn((_name, fn) => fn),
  response: mockResponse,
}))

// Mock the stats functions
const mockGetYearlyTotalStats = jest.fn<() => Promise<YearlyTotalStat[]>>()
const mockGetAvailableYears = jest.fn<() => Promise<number[]>>()
const mockGetDogHandlerBuckets = jest.fn<() => Promise<{ bucket: string; count: number }[]>>()

jest.unstable_mockModule('../lib/stats', () => ({
  getAvailableYears: mockGetAvailableYears,
  getDogHandlerBuckets: mockGetDogHandlerBuckets,
  getYearlyTotalStats: mockGetYearlyTotalStats,
}))

describe('GetYearlyStatsFunction', () => {
  let handler: any

  beforeEach(async () => {
    jest.clearAllMocks()
    // Import the handler after mocking dependencies
    const module = await import('./handler')
    handler = module.default

    // Default mock responses
    mockResponse.mockImplementation((status, body) => ({ body, status }))
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

    // Setup mocks
    mockGetYearlyTotalStats.mockResolvedValueOnce(totals)
    mockGetDogHandlerBuckets.mockResolvedValueOnce(dogHandlerBuckets)

    // Call handler with year parameter
    const event = { queryStringParameters: { year: '2024' } }
    const result = await handler(event)

    // Verify correct functions were called
    expect(mockGetYearlyTotalStats).toHaveBeenCalledWith(year)
    expect(mockGetDogHandlerBuckets).toHaveBeenCalledWith(year)

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(200, { dogHandlerBuckets, totals, year }, event)
    expect(result.body).toEqual({ dogHandlerBuckets, totals, year })
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

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        stats: [
          { dogHandlerBuckets: buckets2023, totals: totals2023, year: 2023 },
          { dogHandlerBuckets: buckets2024, totals: totals2024, year: 2024 },
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
        { dogHandlerBuckets: buckets2023, totals: totals2023, year: 2023 },
        { dogHandlerBuckets: buckets2024, totals: totals2024, year: 2024 },
      ],
      years,
    })
  })
})
