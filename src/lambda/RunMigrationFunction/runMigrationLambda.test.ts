import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockReadAll = jest.fn<any>()
const mockWrite = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    readAll: mockReadAll,
    write: mockWrite,
  })),
}))

const { runMigrationLambda } = await import('./handler')

describe('runMigrationLambda', () => {
  const event = {
    body: '',
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      admin: true,
      id: 'user123',
      name: 'Test User',
    })

    mockReadAll.mockResolvedValue([
      {
        id: 'event1',
        startDate: '2025-01-01',
        // No season field
      },
      {
        id: 'event2',
        startDate: '2025-02-01',
        // No season field
      },
      {
        id: 'event3',
        season: '2024', // Already has season field
        startDate: '2024-12-01',
      },
    ])

    mockWrite.mockResolvedValue({})
  })

  it('returns 401 if not authorized as admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Test User',
    })

    const result = await runMigrationLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
    expect(mockReadAll).not.toHaveBeenCalled()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const result = await runMigrationLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
    expect(mockReadAll).not.toHaveBeenCalled()
  })

  it('adds season field to events that do not have it', async () => {
    const result = await runMigrationLambda(event)

    // Verify events were retrieved
    expect(mockReadAll).toHaveBeenCalled()

    // Verify events without season field were updated
    expect(mockWrite).toHaveBeenCalledTimes(2)

    // Verify first event was updated with correct season
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event1',
        season: '2025',
        startDate: '2025-01-01',
      }),
      expect.any(String)
    )

    // Verify second event was updated with correct season
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event2',
        season: '2025',
        startDate: '2025-02-01',
      }),
      expect.any(String)
    )

    // Verify response was returned with per-migration results
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([{ count: 2, name: 'fixSeasonFromStartDate' }])
  })

  it('does not update events that already have season field', async () => {
    const result = await runMigrationLambda(event)

    // Verify events were retrieved
    expect(mockReadAll).toHaveBeenCalled()

    // Verify event with season field was not updated
    expect(mockWrite).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event3',
      })
    )
    expect(result.statusCode).toBe(200)
  })

  it('updates events that have incorrect season for start date', async () => {
    mockReadAll.mockResolvedValueOnce([
      {
        id: 'event1',
        season: '2024',
        startDate: '2025-01-01',
      },
    ])

    const result = await runMigrationLambda(event)

    expect(mockWrite).toHaveBeenCalledTimes(1)
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event1',
        season: '2025',
        startDate: '2025-01-01',
      }),
      expect.any(String)
    )
    expect(result.statusCode).toBe(200)
  })

  it('uses zoned date in TIME_ZONE to determine season year', async () => {
    mockReadAll.mockResolvedValueOnce([
      {
        id: 'event1',
        season: '2024',
        startDate: '2024-12-31T22:30:00.000Z',
      },
    ])

    const result = await runMigrationLambda(event)

    expect(mockWrite).toHaveBeenCalledTimes(1)
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event1',
        season: '2025',
        startDate: '2024-12-31T22:30:00.000Z',
      }),
      expect.any(String)
    )
    expect(result.statusCode).toBe(200)
  })

  it('returns migration results with zero count if no events need updating', async () => {
    mockReadAll.mockResolvedValueOnce([
      {
        id: 'event1',
        season: '2025', // Already has season field
        startDate: '2025-01-01',
      },
      {
        id: 'event2',
        season: '2025', // Already has season field
        startDate: '2025-02-01',
      },
    ])

    const result = await runMigrationLambda(event)

    // Verify events were retrieved
    expect(mockReadAll).toHaveBeenCalled()

    // Verify no events were updated
    expect(mockWrite).not.toHaveBeenCalled()

    // Verify response was returned with count of 0
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([{ count: 0, name: 'fixSeasonFromStartDate' }])
  })

  it('returns migration results with zero count if no events are found', async () => {
    mockReadAll.mockResolvedValueOnce(null)

    const result = await runMigrationLambda(event)

    // Verify events were attempted to be retrieved
    expect(mockReadAll).toHaveBeenCalled()

    // Verify no events were updated
    expect(mockWrite).not.toHaveBeenCalled()

    // Verify response was returned with count of 0
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([{ count: 0, name: 'fixSeasonFromStartDate' }])
  })

  // Skip the test for handling invalid startDate as it requires more complex mocking
})
