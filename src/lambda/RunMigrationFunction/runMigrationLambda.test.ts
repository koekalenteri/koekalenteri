import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockAuthorize = vi.fn()
const mockReadAll = vi.fn()
const mockWrite = vi.fn()

vi.doMock('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
  authorizeAdmin: async (event: any) => {
    const user = await mockAuthorize(event)
    if (!user) return { res: mockResponse(401, 'Unauthorized', event) ?? { statusCode: 401 } }
    if (!user.admin) return { res: mockResponse(403, 'Forbidden', event) ?? { statusCode: 403 }, user }
    return { user }
  },
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      readAll: mockReadAll,
      write: mockWrite,
    }
  }),
}))

const { default: runMigrationLambda } = await import('./handler')

describe('runMigrationLambda', () => {
  const migrationResults = (updatedAt: number, season: number, startNumbers = 0) => [
    { count: updatedAt, name: 'populateUpdatedAtFromModifiedAt' },
    { count: season, name: 'fixSeasonFromStartDate' },
    { count: startNumbers, name: 'backfillStartNumbersPublished' },
  ]

  const event = constructPartialAPIGwEvent({
    body: '',
    headers: {},
  })

  beforeEach(() => {
    vi.clearAllMocks()

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

  it('returns 403 if authenticated user is not an admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Test User',
    })

    await runMigrationLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
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
        season: '2025',
        startDate: '2025-01-01',
      })
    )

    // Verify second event was updated with correct season
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event2',
        season: '2025',
        startDate: '2025-02-01',
      })
    )

    // Verify response was returned with per-migration results
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 2), event)
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

  it('updates events that have incorrect season for start date', async () => {
    mockReadAll.mockResolvedValueOnce([
      {
        id: 'event1',
        season: '2024',
        startDate: '2025-01-01',
      },
    ])

    await runMigrationLambda(event)

    expect(mockWrite).toHaveBeenCalledTimes(1)
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event1',
        season: '2025',
        startDate: '2025-01-01',
      })
    )
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 1), event)
  })

  it('uses zoned date in TIME_ZONE to determine season year', async () => {
    mockReadAll.mockResolvedValueOnce([
      {
        id: 'event1',
        season: '2024',
        startDate: '2024-12-31T22:30:00.000Z',
      },
    ])

    await runMigrationLambda(event)

    expect(mockWrite).toHaveBeenCalledTimes(1)
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event1',
        season: '2025',
        startDate: '2024-12-31T22:30:00.000Z',
      })
    )
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 1), event)
  })

  it('populates updatedAt from modifiedAt when missing', async () => {
    mockReadAll.mockResolvedValueOnce([
      {
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        season: '2026',
        startDate: '2026-01-01',
      },
    ])

    await runMigrationLambda(event)

    expect(mockWrite).toHaveBeenCalledTimes(1)
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
      })
    )
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(1, 0), event)
  })

  it('does not overwrite existing updatedAt', async () => {
    mockReadAll.mockResolvedValueOnce([
      {
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        season: '2026',
        startDate: '2026-01-01',
        updatedAt: '2026-01-02T10:00:00.000Z',
      },
    ])

    await runMigrationLambda(event)

    expect(mockWrite).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), event)
  })

  it('does not populate updatedAt from invalid modifiedAt', async () => {
    mockReadAll.mockResolvedValueOnce([
      {
        id: 'event1',
        modifiedAt: '',
        season: '2026',
        startDate: '2026-01-01',
      },
      {
        id: 'event2',
        modifiedAt: 'not-a-date',
        season: '2026',
        startDate: '2026-01-02',
      },
    ])

    await runMigrationLambda(event)

    expect(mockWrite).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), event)
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

    await runMigrationLambda(event)

    // Verify events were retrieved
    expect(mockReadAll).toHaveBeenCalled()

    // Verify no events were updated
    expect(mockWrite).not.toHaveBeenCalled()

    // Verify response was returned with count of 0
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), event)
  })

  it('returns migration results with zero count if no events are found', async () => {
    mockReadAll.mockResolvedValueOnce(null)

    await runMigrationLambda(event)

    // Verify events were attempted to be retrieved
    expect(mockReadAll).toHaveBeenCalled()

    // Verify no events were updated
    expect(mockWrite).not.toHaveBeenCalled()

    // Verify response was returned with count of 0
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), event)
  })

  // Skip the test for handling invalid startDate as it requires more complex mocking

  describe('backfillStartNumbersPublished', () => {
    it('writes an explicit false when the start list is unpublished', async () => {
      mockReadAll.mockResolvedValueOnce([
        { id: 'event1', season: '2026', startDate: '2026-01-01', startListPublished: false, updatedAt: 'kept' },
      ])

      await runMigrationLambda(event)

      expect(mockWrite).toHaveBeenCalledTimes(1)
      expect(mockWrite).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'event1', startNumbersPublished: false, updatedAt: expect.any(String) })
      )
      // The incremental fetch reads updatedAt, so the backfill must move it
      expect(mockWrite).not.toHaveBeenCalledWith(expect.objectContaining({ updatedAt: 'kept' }))
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 1), event)
    })

    it('mirrors a per-class list, holding back only the unpublished classes', async () => {
      mockReadAll.mockResolvedValueOnce([
        {
          id: 'event1',
          season: '2026',
          startDate: '2026-01-01',
          startListPublished: { ALO: true, AVO: false },
          updatedAt: 'kept',
        },
      ])

      await runMigrationLambda(event)

      expect(mockWrite).toHaveBeenCalledWith(
        expect.objectContaining({ startNumbersPublished: { ALO: true, AVO: false } })
      )
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 1), event)
    })

    it.each`
      startListPublished          | reason
      ${true}                     | ${'a published list has been showing its numbers'}
      ${undefined}                | ${'an absent flag means published'}
      ${{ ALO: true, AVO: true }} | ${'every class is already out'}
    `('leaves the event alone when $reason', async ({ startListPublished }) => {
      mockReadAll.mockResolvedValueOnce([
        { id: 'event1', season: '2026', startDate: '2026-01-01', startListPublished, updatedAt: 'kept' },
      ])

      await runMigrationLambda(event)

      expect(mockWrite).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0), event)
    })

    it('does not overwrite an existing startNumbersPublished', async () => {
      mockReadAll.mockResolvedValueOnce([
        {
          id: 'event1',
          season: '2026',
          startDate: '2026-01-01',
          startListPublished: false,
          startNumbersPublished: true,
          updatedAt: 'kept',
        },
      ])

      await runMigrationLambda(event)

      expect(mockWrite).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0), event)
    })
  })
})
