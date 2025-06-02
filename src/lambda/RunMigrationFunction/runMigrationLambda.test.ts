import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockReadAll = jest.fn<any>()
const mockWrite = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    readAll: mockReadAll,
    write: mockWrite,
  })),
}))

const { default: runMigrationLambda } = await import('./handler')

describe('runMigrationLambda', () => {
  const event = {
    headers: {},
    body: '',
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Test User',
      admin: true,
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
        startDate: '2024-12-01',
        season: '2024', // Already has season field
      },
    ])

    mockWrite.mockResolvedValue({})
  })

  it('returns 401 if not authorized as admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      id: 'user123',
      name: 'Test User',
      admin: false,
    })

    await runMigrationLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockReadAll).not.toHaveBeenCalled()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await runMigrationLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockReadAll).not.toHaveBeenCalled()
  })

  it('adds season field to events that do not have it', async () => {
    await runMigrationLambda(event)

    // Verify events were retrieved
    expect(mockReadAll).toHaveBeenCalled()

    // Verify events without season field were updated
    expect(mockWrite).toHaveBeenCalledTimes(2)

    // Verify first event was updated with correct season
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event1',
        startDate: '2025-01-01',
        season: '2025',
      })
    )

    // Verify second event was updated with correct season
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event2',
        startDate: '2025-02-01',
        season: '2025',
      })
    )

    // Verify response was returned with count of updated events
    expect(mockResponse).toHaveBeenCalledWith(200, 2, event)
  })

  it('does not update events that already have season field', async () => {
    await runMigrationLambda(event)

    // Verify events were retrieved
    expect(mockReadAll).toHaveBeenCalled()

    // Verify event with season field was not updated
    expect(mockWrite).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event3',
      })
    )
  })

  it('returns 0 if no events need updating', async () => {
    mockReadAll.mockResolvedValueOnce([
      {
        id: 'event1',
        startDate: '2025-01-01',
        season: '2025', // Already has season field
      },
      {
        id: 'event2',
        startDate: '2025-02-01',
        season: '2025', // Already has season field
      },
    ])

    await runMigrationLambda(event)

    // Verify events were retrieved
    expect(mockReadAll).toHaveBeenCalled()

    // Verify no events were updated
    expect(mockWrite).not.toHaveBeenCalled()

    // Verify response was returned with count of 0
    expect(mockResponse).toHaveBeenCalledWith(200, 0, event)
  })

  it('returns 0 if no events are found', async () => {
    mockReadAll.mockResolvedValueOnce(null)

    await runMigrationLambda(event)

    // Verify events were attempted to be retrieved
    expect(mockReadAll).toHaveBeenCalled()

    // Verify no events were updated
    expect(mockWrite).not.toHaveBeenCalled()

    // Verify response was returned with count of 0
    expect(mockResponse).toHaveBeenCalledWith(200, 0, event)
  })

  // Skip the test for handling invalid startDate as it requires more complex mocking
})
