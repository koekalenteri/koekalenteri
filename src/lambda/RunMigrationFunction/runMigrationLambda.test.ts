import { vi } from 'vitest'
import { isMember } from '../../lib/registration'
import { httpError } from '../lib/lambda'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockAuthorize = vi.fn()
const mockReadAllEvents = vi.fn()
const mockReadEvent = vi.fn()
const mockWriteMigratedEvent = vi.fn()
const mockReadApplied = vi.fn()
const mockMarkApplied = vi.fn()
const mockReadRegistrationEventIds = vi.fn()
const mockReadEventRegistrations = vi.fn()
const mockReadRegistration = vi.fn()
const mockWriteMigratedRegistration = vi.fn()
const mockReadAllDogs = vi.fn()
const mockReadDog = vi.fn()
const mockWriteMigratedDog = vi.fn()
const mockReadAllOrganizerEventStats = vi.fn()
const mockReadOrganizerEventStatsRow = vi.fn()
const mockMoveOrganizerEventStatsRow = vi.fn()
const mockStatsMoveWait = vi.fn(async (_attempt: number) => undefined)
const mockBumpDataVersion = vi.fn()
const mockReadOrganizers = vi.fn()
const mockMoveOrganizerEventStats = vi.fn()
const mockReadAllUsers = vi.fn()
const mockReadUser = vi.fn()
const mockWriteMigratedUserRoles = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
  authorizeAdmin: async (event: unknown) => {
    const user = await mockAuthorize(event)
    if (!user) throw httpError(401, 'Unauthorized')
    if (!user.admin) throw httpError(403, 'Forbidden')
    return user
  },
}))

vi.doMock('../lib/dataVersions', () => ({
  bumpDataVersion: mockBumpDataVersion,
  markMigrationApplied: mockMarkApplied,
  readAppliedMigrations: mockReadApplied,
}))

vi.doMock('../lib/repositories/organizerRepository', () => ({
  readOrganizersIncludingDeleted: mockReadOrganizers,
}))

vi.doMock('../lib/repositories/userRepository', () => ({
  readAllUsers: mockReadAllUsers,
  readUser: mockReadUser,
  writeMigratedUserRoles: mockWriteMigratedUserRoles,
}))

// Whether the stats row moves is the repository's pure key comparison, run as it is; the move itself
// is persistence, tested in lib/stats/stats.
vi.doMock('../lib/stats/stats', () => ({
  moveOrganizerEventStats: mockMoveOrganizerEventStats,
}))

vi.doMock('../lib/repositories/eventRepository', () => ({
  readAllEvents: mockReadAllEvents,
  readEvent: mockReadEvent,
  writeMigratedEvent: mockWriteMigratedEvent,
}))

vi.doMock('../lib/repositories/registrationRepository', () => ({
  readEventRegistrations: mockReadEventRegistrations,
  readRegistration: mockReadRegistration,
  readRegistrationEventIds: mockReadRegistrationEventIds,
  writeMigratedRegistration: mockWriteMigratedRegistration,
}))

vi.doMock('../lib/repositories/dogRepository', () => ({
  readAllDogs: mockReadAllDogs,
  readDog: mockReadDog,
  writeMigratedDog: mockWriteMigratedDog,
}))

// The key layout is the repository's own, run as it is.
vi.doMock('../lib/repositories/eventStatsRepository', async () => {
  const actual = await vi.importActual<typeof import('../lib/repositories/eventStatsRepository')>(
    '../lib/repositories/eventStatsRepository'
  )
  return {
    moveOrganizerEventStatsRow: mockMoveOrganizerEventStatsRow,
    // The move's retry as it is, with a wait the tests see and that waits for nothing.
    ORGANIZER_STATS_MOVE_RETRY: { ...actual.ORGANIZER_STATS_MOVE_RETRY, wait: mockStatsMoveWait },
    organizerStatsKey: actual.organizerStatsKey,
    organizerStatsRowEvent: actual.organizerStatsRowEvent,
    readAllOrganizerEventStats: mockReadAllOrganizerEventStats,
    readOrganizerEventStatsRow: mockReadOrganizerEventStatsRow,
  }
})

const { default: runMigrationLambda } = await import('./handler')

/** What the lambda sends for a migrated row: its id, the changed fields only, and the updatedAt it was read with. */
const updatedRow = (id: string | undefined, set: object = {}) =>
  [
    id ?? expect.any(String),
    { set: expect.objectContaining(set) },
    expect.toBeOneOf([undefined, expect.any(String)]),
  ] as const

describe('runMigrationLambda', () => {
  const migrationResults = (
    updatedAt: number,
    season: number,
    startNumbers = 0,
    organizerId = 0,
    repointed = 0,
    roles = 0,
    eventDays = 0
  ) => [
    { count: updatedAt, name: 'populateUpdatedAt' },
    { count: organizerId, name: 'backfillOrganizerId' },
    { count: season, name: 'fixSeasonFromStartDate' },
    { count: startNumbers, name: 'backfillStartNumbersPublished' },
    { count: repointed, name: 'repointOrphanOrganizer' },
    { count: eventDays, name: 'storeEventDaysAsKeys' },
    { count: roles, name: 'repointOrphanOrganizerRoles' },
    { count: 0, name: 'storeRegistrationDaysAsKeys' },
    { count: 0, name: 'storeOwnerSelections' },
    { count: 0, name: 'storeDogDaysAsKeys' },
    { count: 0, name: 'storeOrganizerStatsDaysAsKeys' },
  ]

  // An API Gateway request: it always carries a requestContext, which is what tells it from a direct invoke.
  const event = constructPartialAPIGwEvent({
    body: '',
    headers: {},
    requestContext: { requestId: 'req-1' },
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      admin: true,
      id: 'user123',
      name: 'Test User',
    })

    mockReadAllEvents.mockResolvedValue([
      {
        id: 'event1',
        startDate: '2025-01-01',
        updatedAt: '2025-01-01T00:00:00.000Z',
        // No season field
      },
      {
        id: 'event2',
        startDate: '2025-02-01',
        updatedAt: '2025-01-01T00:00:00.000Z',
        // No season field
      },
      {
        id: 'event3',
        season: '2024', // Already has season field
        startDate: '2024-12-01',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ])

    mockWriteMigratedEvent.mockResolvedValue({})
    mockReadApplied.mockResolvedValue(new Map())
    mockMarkApplied.mockResolvedValue(undefined)
    mockReadRegistrationEventIds.mockResolvedValue([])
    mockReadAllDogs.mockResolvedValue([])
    mockReadAllOrganizerEventStats.mockResolvedValue([])
    // Every organizer id the rows below carry is one the table holds, so the repoint leaves them be.
    mockReadOrganizers.mockResolvedValue([7, 'org1', 'org2', 'org3'].map((id) => ({ id, kcId: 1, name: `Club ${id}` })))
    mockReadAllUsers.mockResolvedValue([])
    mockMoveOrganizerEventStats.mockResolvedValue(undefined)
    mockWriteMigratedUserRoles.mockResolvedValue(undefined)
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
    expect(mockReadAllEvents).not.toHaveBeenCalled()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await runMigrationLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockReadAllEvents).not.toHaveBeenCalled()
  })

  it('adds season field to events that do not have it', async () => {
    await runMigrationLambda(event)

    // Verify events were retrieved
    expect(mockReadAllEvents).toHaveBeenCalled()

    // Verify events without season field were updated
    expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(2)

    // Verify first event was updated with correct season
    expect(mockWriteMigratedEvent).toHaveBeenCalledWith(...updatedRow('event1', { season: '2025' }))

    // Verify second event was updated with correct season
    expect(mockWriteMigratedEvent).toHaveBeenCalledWith(...updatedRow('event2', { season: '2025' }))

    // Verify response was returned with per-migration results
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 2), event)
  })

  it('does not update events that already have season field', async () => {
    await runMigrationLambda(event)

    // Verify events were retrieved
    expect(mockReadAllEvents).toHaveBeenCalled()

    // Verify event with season field was not updated
    expect(mockWriteMigratedEvent).not.toHaveBeenCalledWith(...updatedRow('event3', {}))
  })

  it('updates events that have incorrect season for start date', async () => {
    mockReadAllEvents.mockResolvedValueOnce([
      {
        id: 'event1',
        season: '2024',
        startDate: '2025-01-01',
        updatedAt: 'kept',
      },
    ])

    await runMigrationLambda(event)

    expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(1)
    expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
      ...updatedRow('event1', {
        season: '2025',

        updatedAt: expect.any(String),
      })
    )
    // Every modified row gets the shared updatedAt bump, whatever migration touched it
    expect(mockWriteMigratedEvent).not.toHaveBeenCalledWith(...updatedRow(undefined, { updatedAt: 'kept' }))
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 1), event)
  })

  it('uses zoned date in TIME_ZONE to determine season year', async () => {
    mockReadAllEvents.mockResolvedValueOnce([
      {
        id: 'event1',
        season: '2024',
        startDate: '2024-12-31T22:30:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ])

    await runMigrationLambda(event)

    expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(1)
    expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
      ...updatedRow('event1', { season: '2025', startDate: '2025-01-01' })
    )
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 1, 0, 0, 0, 0, 1), event)
  })

  it('gives a missing updatedAt the shared bump value', async () => {
    mockReadAllEvents.mockResolvedValueOnce([
      {
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        season: '2026',
        startDate: '2026-01-01',
      },
    ])

    await runMigrationLambda(event)

    expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(1)
    expect(mockWriteMigratedEvent).toHaveBeenCalledWith(...updatedRow('event1', { updatedAt: expect.any(String) }))
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(1, 0), event)
  })

  it('does not touch an event that already has updatedAt', async () => {
    mockReadAllEvents.mockResolvedValueOnce([
      {
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        season: '2026',
        startDate: '2026-01-01',
        updatedAt: '2026-01-02T10:00:00.000Z',
      },
    ])

    await runMigrationLambda(event)

    expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), event)
  })

  it('gives updatedAt the shared bump value even when modifiedAt is invalid', async () => {
    mockReadAllEvents.mockResolvedValueOnce([
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

    expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(2)
    expect(mockWriteMigratedEvent).toHaveBeenCalledWith(...updatedRow('event1', { updatedAt: expect.any(String) }))
    expect(mockWriteMigratedEvent).toHaveBeenCalledWith(...updatedRow('event2', { updatedAt: expect.any(String) }))
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(2, 0), event)
  })

  it('returns migration results with zero count if no events need updating', async () => {
    mockReadAllEvents.mockResolvedValueOnce([
      {
        id: 'event1',
        season: '2025', // Already has season field
        startDate: '2025-01-01',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'event2',
        season: '2025', // Already has season field
        startDate: '2025-02-01',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ])

    await runMigrationLambda(event)

    // Verify events were retrieved
    expect(mockReadAllEvents).toHaveBeenCalled()

    // Verify no events were updated
    expect(mockWriteMigratedEvent).not.toHaveBeenCalled()

    // Verify response was returned with count of 0
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), event)
  })

  it('returns migration results with zero count if no events are found', async () => {
    mockReadAllEvents.mockResolvedValueOnce([])

    await runMigrationLambda(event)

    // Verify events were attempted to be retrieved
    expect(mockReadAllEvents).toHaveBeenCalled()

    // Verify no events were updated
    expect(mockWriteMigratedEvent).not.toHaveBeenCalled()

    // Verify response was returned with count of 0
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), event)
  })

  // Skip the test for handling invalid startDate as it requires more complex mocking

  // gsiOrganizerStartDate is keyed on a top-level copy of organizer.id; a row without the copy is
  // invisible to a club administrator's list until the migration writes it (KOE-1341).
  // KOE-1585: a season puts the row into gsiSeasonStartDate, which the public list reads.
  it('gives no season to a deleted event', async () => {
    mockReadAllEvents.mockResolvedValueOnce([
      { deletedAt: '2023-05-01T10:00:00.000Z', id: 'event1', startDate: '2025-01-01', updatedAt: 'x' },
    ])

    await runMigrationLambda(event)

    expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), event)
  })

  describe('backfillOrganizerId', () => {
    it('copies organizer.id to the row where it is missing or stale', async () => {
      mockReadAllEvents.mockResolvedValue([
        { id: 'event1', organizer: { id: 'org1' }, season: '2025', startDate: '2025-01-01', updatedAt: 'x' },
        {
          id: 'event2',
          organizer: { id: 'org2' },
          organizerId: 'org1',
          season: '2025',
          startDate: '2025-01-01',
          updatedAt: 'x',
        },
        {
          id: 'event3',
          organizer: { id: 'org3' },
          organizerId: 'org3',
          season: '2025',
          startDate: '2025-01-01',
          updatedAt: 'x',
        },
      ])

      await runMigrationLambda(event)

      expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(2)
      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(...updatedRow('event1', { organizerId: 'org1' }))
      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(...updatedRow('event2', { organizerId: 'org2' }))
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0, 2), event)
    })

    // KOE-1585: an organizerId puts the row into gsiOrganizerStartDate.
    it('leaves a deleted row out of the organizer index', async () => {
      mockReadAllEvents.mockResolvedValue([
        {
          deletedAt: '2023-05-01T10:00:00.000Z',
          id: 'event1',
          organizer: { id: 'org1' },
          season: '2025',
          startDate: '2025-01-01',
          updatedAt: 'x',
        },
      ])

      await runMigrationLambda(event)

      expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), event)
    })
  })

  // KOE-1580: rows copied from another environment carry that environment's organizer ids, which the
  // organizer table here does not hold. The admin list then shows the club twice.
  describe('repointOrphanOrganizer', () => {
    const directEvent = constructPartialAPIGwEvent({})
    const liveOrganizer = { id: 'aikpqWfqeB', kcId: 9, name: 'AURAN NUUSKUT RY' }
    const orphanRow = (id = 'ia-JHnOtVO') => ({
      id,
      organizer: { id: '-ZC1Jcewbn', name: 'AURAN NUUSKUT RY' },
      organizerId: '-ZC1Jcewbn',
      season: '2024',
      startDate: '2024-03-29',
      updatedAt: 'read',
    })
    const repointed = { id: 'aikpqWfqeB', name: 'AURAN NUUSKUT RY' }

    beforeEach(() => {
      mockReadOrganizers.mockResolvedValue([liveOrganizer])
    })

    it('points an event on an id the table does not hold to the live organizer of the same name', async () => {
      mockReadAllEvents.mockResolvedValueOnce([orphanRow()])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        'ia-JHnOtVO',
        // The name is the same, so only the id is written
        { set: { 'organizer.id': 'aikpqWfqeB', organizerId: 'aikpqWfqeB', updatedAt: expect.any(String) } },
        'read'
      )
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0, 0, 1), directEvent)
    })

    it('moves the organizer stats before it writes the event', async () => {
      mockReadAllEvents.mockResolvedValueOnce([orphanRow()])

      await runMigrationLambda(directEvent)

      expect(mockMoveOrganizerEventStats).toHaveBeenCalledTimes(1)
      expect(mockMoveOrganizerEventStats).toHaveBeenCalledWith(
        expect.objectContaining({ organizer: { id: '-ZC1Jcewbn', name: 'AURAN NUUSKUT RY' } }),
        expect.objectContaining({ organizer: repointed })
      )
      expect(mockMoveOrganizerEventStats).toHaveBeenCalledBefore(mockWriteMigratedEvent)
    })

    it('moves the stats again on the rerun after the event write failed', async () => {
      mockReadAllEvents.mockResolvedValueOnce([orphanRow()])
      mockWriteMigratedEvent.mockRejectedValueOnce(new Error('write failed'))

      await expect(runMigrationLambda(directEvent)).rejects.toThrow('write failed')
      expect(mockMoveOrganizerEventStats).toHaveBeenCalledTimes(1)
      // Each table is recorded when its own run ends: the users ran first and are recorded, none of the
      // event table's migrations is.
      expect(mockMarkApplied).toHaveBeenCalledTimes(1)
      expect(mockMarkApplied).toHaveBeenCalledWith('repointOrphanOrganizerRoles', 0, expect.any(String))

      // The row still carries the orphan id, so the next run finds it again and carries the
      // counters across: the move answers at once when the old row is already gone.
      mockReadAllEvents.mockResolvedValueOnce([orphanRow()])
      await runMigrationLambda(directEvent)

      expect(mockMoveOrganizerEventStats).toHaveBeenCalledTimes(2)
      expect(mockWriteMigratedEvent).toHaveBeenLastCalledWith(
        'ia-JHnOtVO',
        // The name is the same, so only the id is written
        { set: { 'organizer.id': 'aikpqWfqeB', organizerId: 'aikpqWfqeB', updatedAt: expect.any(String) } },
        'read'
      )
      expect(mockMarkApplied).toHaveBeenCalledWith('repointOrphanOrganizer', 1, expect.any(String))
    })

    it('writes no event whose stats could not be moved', async () => {
      mockReadAllEvents.mockResolvedValueOnce([orphanRow()])
      mockMoveOrganizerEventStats.mockRejectedValueOnce(new Error('move failed'))

      await expect(runMigrationLambda(directEvent)).rejects.toThrow('move failed')

      expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
      // Each table is recorded when its own run ends: the users ran first and are recorded, none of the
      // event table's migrations is.
      expect(mockMarkApplied).toHaveBeenCalledTimes(1)
      expect(mockMarkApplied).toHaveBeenCalledWith('repointOrphanOrganizerRoles', 0, expect.any(String))
    })

    // The day migrations read the deleted events too; the repoint decides from the live ones, so a
    // deleted event's other spelling of the name does not leave the orphan id unmatched.
    it("repoints an orphan id by its live events' name, a deleted event of another name with them", async () => {
      const deleted = {
        ...orphanRow('deleted-1'),
        deletedAt: '2024-01-01T00:00:00.000Z',
        organizer: { id: '-ZC1Jcewbn', name: 'Auran Nuuskut' },
      }
      mockReadAllEvents.mockResolvedValueOnce([orphanRow(), deleted])
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        'ia-JHnOtVO',
        { set: { 'organizer.id': 'aikpqWfqeB', organizerId: 'aikpqWfqeB', updatedAt: expect.any(String) } },
        'read'
      )
      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        'deleted-1',
        {
          set: {
            'organizer.id': 'aikpqWfqeB',
            'organizer.name': 'AURAN NUUSKUT RY',
            organizerId: 'aikpqWfqeB',
            updatedAt: expect.any(String),
          },
        },
        'read'
      )
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0, 0, 2), directEvent)
      expect(warn).not.toHaveBeenCalled()
      warn.mockRestore()
    })

    it('leaves a deleted event on an orphan id no live event carries as it is, unreported', async () => {
      const deleted = { ...orphanRow('deleted-1'), deletedAt: '2024-01-01T00:00:00.000Z' }
      mockReadAllEvents.mockResolvedValueOnce([deleted])
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0, 0, 0), directEvent)
      expect(warn).not.toHaveBeenCalled()
      warn.mockRestore()
    })

    // KOE-1547 and KOE-1580 in one write: the stats row goes from the start as stored, under the orphan
    // id, to the start's key under the live one.
    it('moves the stats to the new organizer and the key of the start when both change in one write', async () => {
      mockReadAllEvents.mockResolvedValueOnce([{ ...orphanRow(), startDate: '2024-03-28T22:00:00.000Z' }])

      await runMigrationLambda(directEvent)

      expect(mockMoveOrganizerEventStats).toHaveBeenCalledWith(
        expect.objectContaining({ organizer: orphanRow().organizer, startDate: '2024-03-28T22:00:00.000Z' }),
        expect.objectContaining({ organizer: repointed, startDate: '2024-03-29' })
      )
    })

    // A start rekeyed alone moves its stats row in `storeOrganizerStatsDaysAsKeys`, not here.
    it('does not move the stats of a row whose start alone is rekeyed', async () => {
      mockReadAllEvents.mockResolvedValueOnce([
        { ...orphanRow(), organizer: repointed, organizerId: repointed.id, startDate: '2024-03-28T22:00:00.000Z' },
      ])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        'ia-JHnOtVO',
        { set: expect.objectContaining({ startDate: '2024-03-29' }) },
        'read'
      )
      expect(mockMoveOrganizerEventStats).not.toHaveBeenCalled()
    })

    it('does not move the stats of a row whose organizer stays', async () => {
      mockReadAllEvents.mockResolvedValueOnce([{ ...orphanRow(), organizer: repointed, organizerId: undefined }])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(1)
      expect(mockMoveOrganizerEventStats).not.toHaveBeenCalled()
    })

    it('leaves an event on a soft-deleted organizer as it is', async () => {
      mockReadOrganizers.mockResolvedValue([
        liveOrganizer,
        { deletedAt: '2025-01-01T00:00:00.000Z', id: '-ZC1Jcewbn', name: 'AURAN NUUSKUT RY' },
      ])
      mockReadAllEvents.mockResolvedValueOnce([orphanRow()])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), directEvent)
    })

    it.each([
      ['no live organizer has its name', [{ id: 'other', name: 'Toinen seura' }]],
      ['two live organizers have its name', [liveOrganizer, { id: 'twin', name: 'Auran Nuuskut ry' }]],
    ])('reports the events it left alone when %s, in one warning', async (_label, organizers) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockReadOrganizers.mockResolvedValue(organizers)
      mockReadAllEvents.mockResolvedValueOnce([orphanRow(), orphanRow('qM0H5WG_5C')])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
      const skipped = { count: 2, ids: ['ia-JHnOtVO', 'qM0H5WG_5C'] }
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        expect.arrayContaining([{ count: 0, name: 'repointOrphanOrganizer', skipped }]),
        directEvent
      )
      expect(loggedLines(warn)).toEqual([
        expect.objectContaining({
          message: 'migrations left rows as they were',
          skipped: [
            expect.objectContaining({
              ...skipped,
              detail: [expect.objectContaining({ eventIds: skipped.ids, organizerId: '-ZC1Jcewbn' })],
              name: 'repointOrphanOrganizer',
            }),
          ],
        }),
      ])
      // Reported, then recorded: a rerun would find the same rows and leave them again.
      expect(mockMarkApplied).toHaveBeenCalledWith('repointOrphanOrganizer', 0, expect.any(String))
      warn.mockRestore()
    })

    it('fails without recording anything when the organizer table holds no live organizer', async () => {
      mockReadOrganizers.mockResolvedValue([{ deletedAt: '2025-01-01T00:00:00.000Z', id: 'x', name: 'Seura' }])
      mockReadAllEvents.mockResolvedValueOnce([orphanRow()])

      await runMigrationLambda(directEvent)

      expect(mockResponse).toHaveBeenCalledWith(
        500,
        { error: expect.stringContaining('no live organizer') },
        directEvent
      )
      expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
      expect(mockMarkApplied).not.toHaveBeenCalled()
    })

    it('runs on an empty table without the organizer check', async () => {
      mockReadOrganizers.mockResolvedValue([])
      mockReadAllEvents.mockResolvedValueOnce([])

      await runMigrationLambda(directEvent)

      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), directEvent)
    })
  })

  describe('repointOrphanOrganizerRoles', () => {
    const directEvent = constructPartialAPIGwEvent({})
    // A function: the migrations change the rows they are given.
    const orphanRow = () => ({
      id: 'ia-JHnOtVO',
      organizer: { id: '-ZC1Jcewbn', name: 'AURAN NUUSKUT RY' },
      organizerId: '-ZC1Jcewbn',
      season: '2024',
      startDate: '2024-03-29',
      updatedAt: 'read',
    })
    const userWith = (roles: Record<string, string>) => ({ email: 'u@example.com', id: 'user-1', roles })

    beforeEach(() => {
      mockReadOrganizers.mockResolvedValue([{ id: 'aikpqWfqeB', kcId: 9, name: 'AURAN NUUSKUT RY' }])
      mockReadAllEvents.mockImplementation(async () => [orphanRow()])
    })

    it('moves a role on the orphan id to the live id, held to the roles it was read with', async () => {
      mockReadAllUsers.mockResolvedValueOnce([userWith({ '-ZC1Jcewbn': 'secretary' })])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedUserRoles).toHaveBeenCalledWith(
        'user-1',
        { aikpqWfqeB: 'secretary' },
        { '-ZC1Jcewbn': 'secretary' },
        expect.any(String)
      )
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0, 0, 1, 1), directEvent)
    })

    it('keeps the stronger role when the user already has one on the live id', async () => {
      mockReadAllUsers.mockResolvedValueOnce([userWith({ '-ZC1Jcewbn': 'admin', aikpqWfqeB: 'secretary' })])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedUserRoles).toHaveBeenCalledWith(
        'user-1',
        { aikpqWfqeB: 'admin' },
        { '-ZC1Jcewbn': 'admin', aikpqWfqeB: 'secretary' },
        expect.any(String)
      )
    })

    it('invalidates the cached user lists of both organizers', async () => {
      mockReadAllUsers.mockResolvedValueOnce([userWith({ '-ZC1Jcewbn': 'secretary' })])

      await runMigrationLambda(directEvent)

      expect(mockBumpDataVersion).toHaveBeenCalledTimes(1)
      expect(mockBumpDataVersion).toHaveBeenCalledWith('users', expect.arrayContaining(['-ZC1Jcewbn', 'aikpqWfqeB']))
    })

    it('moves the roles before it repoints the events, which the mapping is read from', async () => {
      mockReadAllUsers.mockResolvedValueOnce([userWith({ '-ZC1Jcewbn': 'secretary' })])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedUserRoles).toHaveBeenCalledBefore(mockWriteMigratedEvent)
    })

    it('bumps the scopes of the users written before a later write failed', async () => {
      mockReadAllUsers.mockResolvedValueOnce([
        { ...userWith({ '-ZC1Jcewbn': 'secretary' }), id: 'user-a' },
        { ...userWith({ '-ZC1Jcewbn': 'admin', third: 'secretary' }), id: 'user-b' },
        { ...userWith({ '-ZC1Jcewbn': 'secretary', fourth: 'admin' }), id: 'user-c' },
      ])
      mockWriteMigratedUserRoles
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('write failed'))

      await expect(runMigrationLambda(directEvent)).rejects.toThrow('write failed')

      expect(mockBumpDataVersion).toHaveBeenCalledTimes(1)
      expect(mockBumpDataVersion).toHaveBeenCalledWith(
        'users',
        expect.arrayContaining(['-ZC1Jcewbn', 'aikpqWfqeB', 'third'])
      )
      // The user whose write failed is still as read: its scopes have not moved
      expect(mockBumpDataVersion).toHaveBeenCalledWith('users', expect.not.arrayContaining(['fourth']))
      expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
      expect(mockMarkApplied).not.toHaveBeenCalled()
    })

    it('writes no user and bumps nothing when no role is on an orphan id', async () => {
      mockReadAllUsers.mockResolvedValueOnce([userWith({ aikpqWfqeB: 'admin' })])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedUserRoles).not.toHaveBeenCalled()
      expect(mockBumpDataVersion).not.toHaveBeenCalled()
    })

    it('migrates the fresh row again after a conflict', async () => {
      const conflict = Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException',
      })
      mockReadAllUsers.mockResolvedValueOnce([userWith({ '-ZC1Jcewbn': 'secretary' })])
      mockWriteMigratedUserRoles.mockRejectedValueOnce(conflict)
      mockReadUser.mockResolvedValueOnce(userWith({ '-ZC1Jcewbn': 'secretary', other: 'admin' }))

      await runMigrationLambda(directEvent)

      expect(mockReadUser).toHaveBeenCalledWith('user-1', true)
      expect(mockWriteMigratedUserRoles).toHaveBeenLastCalledWith(
        'user-1',
        { aikpqWfqeB: 'secretary', other: 'admin' },
        { '-ZC1Jcewbn': 'secretary', other: 'admin' },
        expect.any(String)
      )
    })

    it('repoints the roles from all the events when only the role migration is pending', async () => {
      const applied = new Map<string, string>()
      mockMarkApplied.mockImplementation(async (name: string, _count: number, hash: string) => {
        applied.set(name, hash)
      })
      // A forced run on an empty table records every hash
      mockReadAllEvents.mockResolvedValueOnce([])
      await runMigrationLambda(event)
      applied.delete('repointOrphanOrganizerRoles')
      vi.clearAllMocks()
      mockReadApplied.mockResolvedValue(applied)
      mockReadAllUsers.mockResolvedValueOnce([userWith({ '-ZC1Jcewbn': 'secretary' })])

      await runMigrationLambda(directEvent)

      expect(mockReadAllEvents).toHaveBeenCalledTimes(1)
      expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
      expect(mockWriteMigratedUserRoles).toHaveBeenCalledWith(
        'user-1',
        { aikpqWfqeB: 'secretary' },
        { '-ZC1Jcewbn': 'secretary' },
        expect.any(String)
      )
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'repointOrphanOrganizerRoles' }], directEvent)
    })

    it('reports a role on an id no organizer row and no single match accounts for', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockReadAllUsers.mockResolvedValueOnce([userWith({ aikpqWfqeB: 'admin', nowhere: 'secretary' })])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedUserRoles).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        expect.arrayContaining([
          { count: 0, name: 'repointOrphanOrganizerRoles', skipped: { count: 1, ids: ['user-1'] } },
        ]),
        directEvent
      )
      expect(loggedLines(warn)).toEqual([
        expect.objectContaining({
          skipped: [
            expect.objectContaining({
              detail: [{ organizerIds: ['nowhere'], userId: 'user-1' }],
              name: 'repointOrphanOrganizerRoles',
            }),
          ],
        }),
      ])
      warn.mockRestore()
    })
  })

  describe('backfillStartNumbersPublished', () => {
    it('writes an explicit false when the start list is unpublished', async () => {
      mockReadAllEvents.mockResolvedValueOnce([
        { id: 'event1', season: '2026', startDate: '2026-01-01', startListPublished: false, updatedAt: 'kept' },
      ])

      await runMigrationLambda(event)

      expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(1)
      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        ...updatedRow('event1', { startNumbersPublished: false, updatedAt: expect.any(String) })
      )
      // The incremental fetch reads updatedAt, so the backfill must move it
      expect(mockWriteMigratedEvent).not.toHaveBeenCalledWith(...updatedRow(undefined, { updatedAt: 'kept' }))
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 1), event)
    })

    it('mirrors a per-class list, holding back only the unpublished classes', async () => {
      mockReadAllEvents.mockResolvedValueOnce([
        {
          id: 'event1',
          season: '2026',
          startDate: '2026-01-01',
          startListPublished: { ALO: true, AVO: false },
          updatedAt: 'kept',
        },
      ])

      await runMigrationLambda(event)

      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        ...updatedRow(undefined, { startNumbersPublished: { ALO: true, AVO: false } })
      )
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 1), event)
    })

    it.each`
      startListPublished          | reason
      ${true}                     | ${'a published list has been showing its numbers'}
      ${undefined}                | ${'an absent flag means published'}
      ${{ ALO: true, AVO: true }} | ${'every class is already out'}
    `('leaves the event alone when $reason', async ({ startListPublished }) => {
      mockReadAllEvents.mockResolvedValueOnce([
        { id: 'event1', season: '2026', startDate: '2026-01-01', startListPublished, updatedAt: 'kept' },
      ])

      await runMigrationLambda(event)

      expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0), event)
    })

    it('does not overwrite an existing startNumbersPublished', async () => {
      mockReadAllEvents.mockResolvedValueOnce([
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

      expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0), event)
    })
  })
  describe('registry of applied migrations', () => {
    const allNames = [
      'populateUpdatedAt',
      'backfillOrganizerId',
      'fixSeasonFromStartDate',
      'backfillStartNumbersPublished',
      'repointOrphanOrganizer',
      'storeEventDaysAsKeys',
      'repointOrphanOrganizerRoles',
      'storeRegistrationDaysAsKeys',
      'storeOwnerSelections',
      'storeDogDaysAsKeys',
      'storeOrganizerStatsDaysAsKeys',
    ]

    // What `aws lambda invoke` delivers: no API Gateway around it, so no requestContext.
    const directEvent = constructPartialAPIGwEvent({})

    // A function: the migrations mutate the rows they are given.
    const organizerRow = () => ({
      id: 'event1',
      organizer: { id: 7 },
      season: '2025',
      startDate: '2025-01-01',
      updatedAt: 'kept',
    })

    // The code hashes the lambda computes, learned from what a run records.
    let hashes: Map<string, string>

    const registryWith = (names: string[]) => new Map(names.map((name) => [name, hashes.get(name)]))
    const allButOrganizer = () => registryWith(allNames.filter((name) => name !== 'backfillOrganizerId'))

    beforeEach(async () => {
      hashes = new Map()
      mockMarkApplied.mockImplementation(async (name: string, _count: number, hash: string) => {
        hashes.set(name, hash)
      })
      mockReadAllEvents.mockResolvedValueOnce([])
      await runMigrationLambda(event)
      vi.clearAllMocks()
      mockMarkApplied.mockResolvedValue(undefined)
    })

    it('forces a full run from the admin path without consulting the registry', async () => {
      mockReadApplied.mockResolvedValue(registryWith(allNames))

      await runMigrationLambda(event)

      expect(mockReadApplied).not.toHaveBeenCalled()
      expect(mockReadAllEvents).toHaveBeenCalledTimes(1)
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 2), event)
    })

    it('records every migration of a forced run, with the hash of its code', async () => {
      await runMigrationLambda(event)

      expect(mockMarkApplied).toHaveBeenCalledTimes(11)
      expect(mockMarkApplied).toHaveBeenCalledWith('fixSeasonFromStartDate', 2, hashes.get('fixSeasonFromStartDate'))
      expect(mockMarkApplied).toHaveBeenCalledWith('populateUpdatedAt', 0, hashes.get('populateUpdatedAt'))
      expect(new Set(hashes.values()).size).toBe(11)
    })

    it('reads the registry once, for every migration in the code', async () => {
      await runMigrationLambda(directEvent)

      expect(mockReadApplied).toHaveBeenCalledTimes(1)
      expect(mockReadApplied).toHaveBeenCalledWith(allNames)
    })

    it('returns without reading the event table when nothing is missing', async () => {
      mockReadApplied.mockResolvedValue(registryWith(allNames))

      await runMigrationLambda(directEvent)

      expect(mockReadAllEvents).not.toHaveBeenCalled()
      expect(mockReadOrganizers).not.toHaveBeenCalled()
      expect(mockReadAllUsers).not.toHaveBeenCalled()
      expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
      expect(mockMarkApplied).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, [], directEvent)
    })

    it('runs a migration again when its stored hash differs from the code', async () => {
      mockReadApplied.mockResolvedValue(new Map([...registryWith(allNames), ['backfillOrganizerId', 'old-hash']]))
      mockReadAllEvents.mockResolvedValueOnce([organizerRow()])

      await runMigrationLambda(directEvent)

      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'backfillOrganizerId' }], directEvent)
    })

    it('does not run a migration whose stored hash equals the code', async () => {
      mockReadApplied.mockResolvedValue(registryWith(allNames))

      await runMigrationLambda(directEvent)

      expect(mockReadAllEvents).not.toHaveBeenCalled()
    })

    it('treats a registry row without a hash as pending', async () => {
      mockReadApplied.mockResolvedValue(new Map([...registryWith(allNames), ['backfillOrganizerId', undefined]]))
      mockReadAllEvents.mockResolvedValueOnce([organizerRow()])

      await runMigrationLambda(directEvent)

      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'backfillOrganizerId' }], directEvent)
    })

    it('does not authorize a direct invocation', async () => {
      mockAuthorize.mockResolvedValue(null)

      await runMigrationLambda(directEvent)

      expect(mockAuthorize).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, expect.anything(), directEvent)
    })

    it.each([
      ['an empty body', { body: '' }],
      ['a body that names a null requestContext', { body: JSON.stringify({ requestContext: null }) }],
      ['a header that mimics direct invocation', { body: '', headers: { requestContext: '' } }],
    ])('still authorizes an API Gateway event with %s', async (_label, extra) => {
      mockAuthorize.mockResolvedValue(null)
      const apiEvent = constructPartialAPIGwEvent({ ...extra, requestContext: { requestId: 'req-1' } })

      await runMigrationLambda(apiEvent)

      expect(mockAuthorize).toHaveBeenCalledWith(apiEvent)
      expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', apiEvent)
      expect(mockReadAllEvents).not.toHaveBeenCalled()
    })

    it('reads the event table once and runs only the missing migrations', async () => {
      mockReadApplied.mockResolvedValue(allButOrganizer())
      mockReadAllEvents.mockResolvedValueOnce([organizerRow(), { ...organizerRow(), id: 'event2', organizerId: 7 }])

      await runMigrationLambda(directEvent)

      expect(mockReadAllEvents).toHaveBeenCalledTimes(1)
      expect(mockReadOrganizers).toHaveBeenCalledTimes(1)
      // The role migration is applied, so the user table is not read
      expect(mockReadAllUsers).not.toHaveBeenCalled()
      expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(1)
      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        ...updatedRow('event1', { organizerId: 7, updatedAt: expect.not.stringMatching(/^kept$/) })
      )
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'backfillOrganizerId' }], directEvent)
    })

    it('does not run an applied migration even when its rows would change', async () => {
      mockReadApplied.mockResolvedValue(registryWith(['fixSeasonFromStartDate']))
      mockReadAllEvents.mockResolvedValueOnce([
        { id: 'event1', season: '2024', startDate: '2025-01-01', updatedAt: 'kept' },
      ])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).not.toHaveBeenCalledWith(...updatedRow('event1', {}))
    })

    it('records each migration it ran, with its count, after the writes', async () => {
      mockReadApplied.mockResolvedValue(allButOrganizer())
      mockReadAllEvents.mockResolvedValueOnce([organizerRow()])

      await runMigrationLambda(directEvent)

      expect(mockMarkApplied).toHaveBeenCalledTimes(1)
      expect(mockMarkApplied).toHaveBeenCalledWith('backfillOrganizerId', 1, hashes.get('backfillOrganizerId'))
    })

    it('records nothing when a write fails', async () => {
      mockReadApplied.mockResolvedValue(allButOrganizer())
      mockReadAllEvents.mockResolvedValueOnce([organizerRow()])
      mockWriteMigratedEvent.mockRejectedValueOnce(new Error('write failed'))

      await expect(runMigrationLambda(directEvent)).rejects.toThrow('write failed')

      expect(mockMarkApplied).not.toHaveBeenCalled()
    })

    it('starts no further row after a write has failed', async () => {
      mockReadApplied.mockResolvedValue(allButOrganizer())
      mockReadAllEvents.mockResolvedValueOnce(
        Array.from({ length: 12 }, (_, i) => ({ ...organizerRow(), id: `event${i}` }))
      )
      mockWriteMigratedEvent.mockRejectedValueOnce(new Error('write failed'))

      await expect(runMigrationLambda(directEvent)).rejects.toThrow('write failed')

      // Only the rows already in flight (the concurrency limit) were written, not the other seven
      expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(5)
    })
  })

  describe('concurrent saves', () => {
    const directEvent = constructPartialAPIGwEvent({})
    const conflict = () =>
      Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' })
    const readRow = () => ({
      id: 'event1',
      organizer: { id: 7 },
      season: '2025',
      startDate: '2025-01-01',
      updatedAt: 'read',
    })

    beforeEach(() => {
      mockReadApplied.mockResolvedValue(new Map())
    })

    it('sends only the fields the migrations changed, so fields written meanwhile are not undone', async () => {
      mockReadAllEvents.mockResolvedValueOnce([readRow()])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(1)
      // Held to the updatedAt the row had when it was read: a row someone moved must not be written over.
      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        'event1',
        { set: { organizerId: 7, updatedAt: expect.any(String) } },
        'read'
      )
    })

    it('holds a row read without updatedAt to still having none', async () => {
      const { updatedAt: _updatedAt, ...withoutUpdatedAt } = readRow()
      mockReadAllEvents.mockResolvedValueOnce([withoutUpdatedAt])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        'event1',
        { set: { organizerId: 7, updatedAt: expect.any(String) } },
        undefined
      )
    })

    it('migrates the fresh row again after a conflict and sends only its own changes', async () => {
      mockReadAllEvents.mockResolvedValueOnce([readRow()])
      mockWriteMigratedEvent.mockRejectedValueOnce(conflict())
      mockReadEvent.mockResolvedValueOnce({ ...readRow(), name: 'saved by the secretary', updatedAt: 'secretary' })

      await runMigrationLambda(directEvent)

      expect(mockReadEvent).toHaveBeenCalledWith('event1', true)
      expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(2)
      expect(mockWriteMigratedEvent).toHaveBeenLastCalledWith(
        'event1',
        { set: { organizerId: 7, updatedAt: expect.any(String) } },
        'secretary'
      )
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0, 1), directEvent)
    })

    it('fails the invocation and records nothing after three conflicts', async () => {
      mockReadAllEvents.mockResolvedValueOnce([readRow()])
      mockWriteMigratedEvent.mockRejectedValue(conflict())
      mockReadEvent.mockImplementation(async () => readRow())

      await runMigrationLambda(directEvent)

      expect(mockResponse).toHaveBeenCalledWith(409, { error: expect.stringContaining('kept changing') }, directEvent)
      expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(3)
      // Each table is recorded when its own run ends: the users ran first and are recorded, none of the
      // event table's migrations is.
      expect(mockMarkApplied).toHaveBeenCalledTimes(1)
      expect(mockMarkApplied).toHaveBeenCalledWith('repointOrphanOrganizerRoles', 0, expect.any(String))
    })

    it('does not write a row the other save already migrated', async () => {
      mockReadAllEvents.mockResolvedValueOnce([readRow()])
      mockWriteMigratedEvent.mockRejectedValueOnce(conflict())
      mockReadEvent.mockResolvedValueOnce({ ...readRow(), organizerId: 7, updatedAt: 'secretary' })

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(1)
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0, 0), directEvent)
    })

    it('does not recreate a row that was deleted meanwhile', async () => {
      mockReadAllEvents.mockResolvedValueOnce([readRow()])
      mockWriteMigratedEvent.mockRejectedValueOnce(conflict())
      mockReadEvent.mockResolvedValueOnce(undefined)

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(1)
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0, 0), directEvent)
    })
  })
  // KOE-1547: every stored calendar day becomes a key. The days were stored as the instants they start
  // at in Finland (21:00 or 22:00 UTC the evening before), the entry end as the last millisecond of
  // its Finnish day, and a dog's dates in whatever form a browser or Kennelliitto gave them.
  describe('the calendar days as keys (KOE-1547)', () => {
    const directEvent = constructPartialAPIGwEvent({})
    const conflict = () =>
      Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' })

    // The registry lists every migration as applied but the one named.
    let hashes: Map<string, string>
    const pendingOnly = (name: string) => new Map([...hashes].filter(([applied]) => applied !== name))

    beforeEach(async () => {
      hashes = new Map()
      mockMarkApplied.mockImplementation(async (name: string, _count: number, hash: string) => {
        hashes.set(name, hash)
      })
      mockReadAllEvents.mockResolvedValueOnce([])
      await runMigrationLambda(event)
      vi.clearAllMocks()
      mockMarkApplied.mockResolvedValue(undefined)
      mockReadRegistrationEventIds.mockResolvedValue([])
      mockReadAllDogs.mockResolvedValue([])
      mockReadAllOrganizerEventStats.mockResolvedValue([])
    })

    const storedEvent = () => ({
      classes: [
        { class: 'ALO', date: '2026-05-31T21:00:00.000Z' },
        { class: 'AVO', date: '2026-06-01' },
      ],
      dates: [{ date: '2026-05-31T21:00:00.000Z', time: 'ap' }],
      endDate: '2026-06-01T21:00:00.000Z',
      entryEndDate: '2026-05-17T20:59:59.999Z',
      entryOrigEndDate: '2026-05-10T20:59:59.999Z',
      entryStartDate: '2026-01-31T22:00:00.000Z',
      id: 'event1',
      kcEvent: { endDate: '2026-06-01T21:00:00.000Z', startDate: '2026-05-31T21:00:00.000Z' },
      organizer: { id: 'org1' },
      organizerId: 'org1',
      qualificationStartDate: '2025-08-18T21:00:00.000Z',
      resultsPublished: { ALO: ['2026-05-31T21:00:00.000Z'], AVO: true },
      season: '2026',
      startDate: '2026-05-31T21:00:00.000Z',
      startNumbersPublished: ['2026-06-01/ap', '2026-06-01T21:00:00.000Z'],
      stations: [{ date: '2026-05-31T21:00:00.000Z', id: 'post-1', number: 1, tasks: 1 }],
      updatedAt: 'read',
    })

    it('writes every day of an event as the key of its Finnish day, and bumps updatedAt', async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeEventDaysAsKeys'))
      mockReadAllEvents.mockResolvedValueOnce([storedEvent()])

      await runMigrationLambda(directEvent)

      expect(mockReadAllEvents).toHaveBeenCalledWith(true)
      expect(mockWriteMigratedEvent).toHaveBeenCalledTimes(1)
      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        'event1',
        {
          // An array is written whole.
          set: {
            classes: [
              { class: 'ALO', date: '2026-06-01' },
              { class: 'AVO', date: '2026-06-01' },
            ],
            dates: [{ date: '2026-06-01', time: 'ap' }],
            endDate: '2026-06-02',
            entryEndDate: '2026-05-17',
            entryOrigEndDate: '2026-05-10',
            entryStartDate: '2026-02-01',
            'kcEvent.endDate': '2026-06-02',
            'kcEvent.startDate': '2026-06-01',
            qualificationStartDate: '2025-08-19',
            'resultsPublished.ALO': ['2026-06-01'],
            startDate: '2026-06-01',
            // A half day stays as it is.
            startNumbersPublished: ['2026-06-01/ap', '2026-06-02'],
            stations: [{ date: '2026-06-01', id: 'post-1', number: 1, tasks: 1 }],
            updatedAt: expect.not.stringMatching(/^read$/),
          },
        },
        'read'
      )
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'storeEventDaysAsKeys' }], directEvent)
      expect(mockMarkApplied).toHaveBeenCalledWith('storeEventDaysAsKeys', 1, hashes.get('storeEventDaysAsKeys'))
    })

    it('leaves an event whose days are keys as it is, so a second run changes nothing', async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeEventDaysAsKeys'))
      mockReadAllEvents.mockResolvedValueOnce([
        { endDate: '2026-06-02', entryEndDate: '2026-05-17', id: 'event1', startDate: '2026-06-01', updatedAt: 'read' },
      ])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 0, name: 'storeEventDaysAsKeys' }], directEvent)
    })

    it("removes the Kennelliitto trial's end that is its empty date, and records the migration", async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeEventDaysAsKeys'))
      mockReadAllEvents.mockResolvedValueOnce([
        {
          endDate: '2026-06-01',
          id: 'event1',
          kcEvent: { classes: [], endDate: '0001-01-01T00:00:00', eventType: 'NOU', startDate: '2026-06-01' },
          startDate: '2026-06-01',
          updatedAt: 'read',
        },
      ])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        'event1',
        { remove: ['kcEvent.endDate'], set: { updatedAt: expect.any(String) } },
        'read'
      )
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'storeEventDaysAsKeys' }], directEvent)
      expect(mockMarkApplied).toHaveBeenCalledWith('storeEventDaysAsKeys', 1, hashes.get('storeEventDaysAsKeys'))
    })

    it('leaves a day it cannot read as it is, counts the row and names it in the log', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockReadApplied.mockResolvedValue(pendingOnly('storeEventDaysAsKeys'))
      mockReadAllEvents.mockResolvedValueOnce([
        { endDate: '2026-06-01T21:00:00.000Z', id: 'event1', startDate: 'not-a-date', updatedAt: 'read' },
      ])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        'event1',
        { set: { endDate: '2026-06-02', updatedAt: expect.any(String) } },
        'read'
      )
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        [{ count: 1, name: 'storeEventDaysAsKeys', unreadable: 1 }],
        directEvent
      )
      // The rows it could change are written; the migration runs again on the next deploy.
      expect(mockMarkApplied).not.toHaveBeenCalled()
      expect(loggedLines(warn)).toEqual([
        expect.objectContaining({
          ids: ['event1'],
          message: 'migration left unreadable values',
          migration: 'storeEventDaysAsKeys',
        }),
      ])
      warn.mockRestore()
    })

    const storedRegistration = () => ({
      dates: [{ date: '2026-05-31T21:00:00.000Z', time: 'ap' }],
      // A browser's local noon of the birth day, as the JSON reviver made of a bare day (KOE-1131).
      dog: {
        dob: '2021-01-01T10:00:00.000Z',
        regNo: 'FI1/21',
        results: [{ class: 'ALO', date: '2025-06-01T00:00:00', type: 'NOME-B' }],
      },
      eventId: 'event1',
      // An older copy keyed the group by the UTC day (KOE-1541).
      group: { date: '2026-05-31T21:00:00.000Z', key: '2026-05-31-ap', number: 1, time: 'ap' },
      id: 'reg1',
      qualifyingResults: [{ class: 'ALO', date: '0001-01-01T00:00:00', official: true, type: 'NOME-B' }],
      results: [{ class: 'ALO', date: '2025-05-31T21:00:00.000Z', id: 'm1', type: 'NOME-B' }],
      startGroup: { date: '2026-05-31T21:00:00.000Z', key: '2026-05-31-ap', number: 1, time: 'ap' },
      updatedAt: 'read',
    })

    it("writes an entry's days, its groups' keys and the dog's dates as keys, an event's rows at a time", async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeRegistrationDaysAsKeys'))
      mockReadRegistrationEventIds.mockResolvedValueOnce(['event1', 'event2'])
      mockReadEventRegistrations.mockResolvedValueOnce([storedRegistration()]).mockResolvedValueOnce([])

      await runMigrationLambda(directEvent)

      // Only the table with a pending migration is read.
      expect(mockReadAllEvents).not.toHaveBeenCalled()
      expect(mockReadAllDogs).not.toHaveBeenCalled()
      expect(mockReadEventRegistrations).toHaveBeenCalledWith('event1', true)
      expect(mockReadEventRegistrations).toHaveBeenCalledWith('event2', true)
      expect(mockWriteMigratedRegistration).toHaveBeenCalledTimes(1)
      expect(mockWriteMigratedRegistration).toHaveBeenCalledWith(
        'event1',
        'reg1',
        {
          set: {
            dates: [{ date: '2026-06-01', time: 'ap' }],
            'dog.dob': '2021-01-01',
            'dog.results': [{ class: 'ALO', date: '2025-06-01', type: 'NOME-B' }],
            'group.date': '2026-06-01',
            'group.key': '2026-06-01-ap',
            // Kennelliitto's empty date is a result without a day.
            qualifyingResults: [{ class: 'ALO', date: '', official: true, type: 'NOME-B' }],
            results: [{ class: 'ALO', date: '2025-06-01', id: 'm1', type: 'NOME-B' }],
            'startGroup.date': '2026-06-01',
            'startGroup.key': '2026-06-01-ap',
            updatedAt: expect.not.stringMatching(/^read$/),
          },
        },
        'read'
      )
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'storeRegistrationDaysAsKeys' }], directEvent)
    })

    it("removes a dog's birth date that is Kennelliitto's empty date", async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeRegistrationDaysAsKeys'))
      mockReadRegistrationEventIds.mockResolvedValueOnce(['event1'])
      mockReadEventRegistrations.mockResolvedValueOnce([
        {
          dates: [],
          dog: { dob: '0000-12-31T22:00:00.000Z', regNo: 'FI1/21' },
          eventId: 'event1',
          id: 'reg1',
          updatedAt: 'read',
        },
      ])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedRegistration).toHaveBeenCalledWith(
        'event1',
        'reg1',
        { remove: ['dog.dob'], set: { updatedAt: expect.any(String) } },
        'read'
      )
    })

    it('migrates a registration afresh after a conflict, read as last written', async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeRegistrationDaysAsKeys'))
      mockReadRegistrationEventIds.mockResolvedValueOnce(['event1'])
      mockReadEventRegistrations.mockResolvedValueOnce([storedRegistration()])
      mockWriteMigratedRegistration.mockRejectedValueOnce(conflict())
      mockReadRegistration.mockResolvedValueOnce({ ...storedRegistration(), notes: 'saved', updatedAt: 'saved' })

      await runMigrationLambda(directEvent)

      expect(mockReadRegistration).toHaveBeenCalledWith('event1', 'reg1', true)
      expect(mockWriteMigratedRegistration).toHaveBeenCalledTimes(2)
      expect(mockWriteMigratedRegistration).toHaveBeenLastCalledWith('event1', 'reg1', expect.anything(), 'saved')
    })

    it("writes a dog's birth date and results' days as keys, held to the values read", async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeDogDaysAsKeys'))
      const dog = {
        dob: '2021-01-01T00:00:00',
        regNo: 'FI1/21',
        results: [
          { class: 'ALO', date: '2025-06-01T00:00:00', type: 'NOME-B' },
          { class: 'AVO', date: '2025-07-01', type: 'NOME-B' },
        ],
      }
      mockReadAllDogs.mockResolvedValueOnce([structuredClone(dog)])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedDog).toHaveBeenCalledWith(dog, {
        set: {
          dob: '2021-01-01',
          results: [
            { class: 'ALO', date: '2025-06-01', type: 'NOME-B' },
            { class: 'AVO', date: '2025-07-01', type: 'NOME-B' },
          ],
        },
      })
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'storeDogDaysAsKeys' }], directEvent)
    })

    it('leaves a stats row whose key names no day, or no event, where it is, and counts the first', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockReadApplied.mockResolvedValue(pendingOnly('storeOrganizerStatsDaysAsKeys'))
      mockReadAllOrganizerEventStats.mockResolvedValueOnce([
        { count: 1, organizerId: 'org1', PK: 'ORG#org1', SK: 'not-a-day#event1' },
        { count: 1, organizerId: 'org1', PK: 'ORG#org1', SK: 'no-event-id' },
      ])

      await runMigrationLambda(directEvent)

      expect(mockMoveOrganizerEventStatsRow).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        [{ count: 0, name: 'storeOrganizerStatsDaysAsKeys', unreadable: 1 }],
        directEvent
      )
      expect(loggedLines(warn)).toEqual([expect.objectContaining({ ids: ['ORG#org1/not-a-day#event1'] })])
      warn.mockRestore()
    })

    it('leaves a registration whose days are keys as it is, and counts nothing', async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeRegistrationDaysAsKeys'))
      mockReadRegistrationEventIds.mockResolvedValueOnce(['event1'])
      mockReadEventRegistrations.mockResolvedValueOnce([
        {
          dates: [{ date: '2026-06-01', time: 'ap' }],
          dog: { dob: '2021-01-01', regNo: 'FI1/21', results: [] },
          eventId: 'event1',
          group: { date: '2026-06-01', key: '2026-06-01-ap', number: 1, time: 'ap' },
          id: 'reg1',
          updatedAt: 'read',
        },
      ])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedRegistration).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 0, name: 'storeRegistrationDaysAsKeys' }], directEvent)
      expect(mockMarkApplied).toHaveBeenCalledWith(
        'storeRegistrationDaysAsKeys',
        0,
        hashes.get('storeRegistrationDaysAsKeys')
      )
    })

    it('counts a registration whose day it cannot read, and does not record the migration as applied', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockReadApplied.mockResolvedValue(pendingOnly('storeRegistrationDaysAsKeys'))
      mockReadRegistrationEventIds.mockResolvedValueOnce(['event1'])
      mockReadEventRegistrations.mockResolvedValueOnce([
        { dates: [{ date: 'eilen', time: 'ap' }], eventId: 'event1', id: 'reg1', updatedAt: 'read' },
      ])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedRegistration).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        [{ count: 0, name: 'storeRegistrationDaysAsKeys', unreadable: 1 }],
        directEvent
      )
      // It runs again on the next deploy.
      expect(mockMarkApplied).not.toHaveBeenCalled()
      expect(loggedLines(warn)).toEqual([expect.objectContaining({ ids: ['event1/reg1'] })])
      warn.mockRestore()
    })

    it("removes a dog's birth date that is Kennelliitto's empty date from the dog table", async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeDogDaysAsKeys'))
      const dog = { dob: '0001-01-01T00:00:00', regNo: 'FI1/21', results: [] }
      mockReadAllDogs.mockResolvedValueOnce([structuredClone(dog)])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedDog).toHaveBeenCalledWith(dog, { remove: ['dob'] })
    })

    it("writes a dog's date stored at 23:00 as the day it falls on, not as the next", async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeDogDaysAsKeys'))
      const dog = {
        dob: '2026-11-06T21:00:00.000Z',
        regNo: 'FI1/21',
        results: [{ class: 'ALO', date: '2026-11-06T21:00:00.000Z', type: 'NOME-B' }],
      }
      mockReadAllDogs.mockResolvedValueOnce([structuredClone(dog)])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedDog).toHaveBeenCalledWith(dog, {
        set: { dob: '2026-11-06', results: [{ class: 'ALO', date: '2026-11-06', type: 'NOME-B' }] },
      })
    })

    it('leaves a dog whose dates are keys as it is, and counts nothing', async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeDogDaysAsKeys'))
      mockReadAllDogs.mockResolvedValueOnce([
        { dob: '2021-01-01', regNo: 'FI1/21', results: [{ class: 'ALO', date: '', type: 'NOME-B' }] },
      ])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedDog).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 0, name: 'storeDogDaysAsKeys' }], directEvent)
    })

    it('counts a dog whose birth date it cannot read, and does not record the migration as applied', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockReadApplied.mockResolvedValue(pendingOnly('storeDogDaysAsKeys'))
      mockReadAllDogs.mockResolvedValueOnce([{ dob: '31.12.2020', regNo: 'FI1/21', results: [] }])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedDog).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        [{ count: 0, name: 'storeDogDaysAsKeys', unreadable: 1 }],
        directEvent
      )
      expect(mockMarkApplied).not.toHaveBeenCalled()
      expect(loggedLines(warn)).toEqual([expect.objectContaining({ ids: ['FI1/21'] })])
      warn.mockRestore()
    })

    it('migrates a dog afresh after the Kennel Club lookup replaced it, held to the dates read again', async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeDogDaysAsKeys'))
      mockReadAllDogs.mockResolvedValueOnce([{ dob: '2021-01-01T00:00:00', regNo: 'FI1/21', results: [] }])
      mockWriteMigratedDog.mockRejectedValueOnce(conflict())
      const replaced = {
        dob: '2021-01-02T00:00:00',
        regNo: 'FI1/21',
        results: [{ class: 'ALO', date: '2025-06-01T00:00:00', type: 'NOME-B' }],
      }
      mockReadDog.mockResolvedValueOnce(structuredClone(replaced))

      await runMigrationLambda(directEvent)

      expect(mockReadDog).toHaveBeenCalledWith('FI1/21')
      expect(mockWriteMigratedDog).toHaveBeenCalledTimes(2)
      expect(mockWriteMigratedDog).toHaveBeenLastCalledWith(replaced, {
        set: { dob: '2021-01-02', results: [{ class: 'ALO', date: '2025-06-01', type: 'NOME-B' }] },
      })
    })

    it('leaves an organizer stats row already keyed by a day where it is', async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeOrganizerStatsDaysAsKeys'))
      mockReadAllOrganizerEventStats.mockResolvedValueOnce([
        { count: 3, organizerId: 'org1', PK: 'ORG#org1', SK: '2026-06-01#event1', updatedAt: 'read' },
      ])

      await runMigrationLambda(directEvent)

      expect(mockMoveOrganizerEventStatsRow).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 0, name: 'storeOrganizerStatsDaysAsKeys' }], directEvent)
    })

    // The move is a transaction: a registration counted on the old row meanwhile cancels it.
    it('moves the stats row read again after a registration was counted on it meanwhile', async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeOrganizerStatsDaysAsKeys'))
      const instantRow = {
        count: 3,
        organizerId: 'org1',
        PK: 'ORG#org1',
        SK: '2026-05-31T21:00:00.000Z#event1',
        updatedAt: 'read',
      }
      mockReadAllOrganizerEventStats.mockResolvedValueOnce([structuredClone(instantRow)])
      mockMoveOrganizerEventStatsRow.mockRejectedValueOnce(
        Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException' })
      )
      const counted = { ...instantRow, count: 4, updatedAt: 'counted' }
      mockReadOrganizerEventStatsRow.mockResolvedValueOnce(structuredClone(counted))

      await runMigrationLambda(directEvent)

      const from = { id: 'event1', organizer: { id: 'org1' }, startDate: '2026-05-31T21:00:00.000Z' }
      expect(mockReadOrganizerEventStatsRow).toHaveBeenCalledWith(from)
      // The move waits before it reads the row again, as a save's move does.
      expect(mockStatsMoveWait).toHaveBeenCalledWith(1)
      expect(mockStatsMoveWait).toHaveBeenCalledBefore(mockReadOrganizerEventStatsRow)
      expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledTimes(2)
      expect(mockMoveOrganizerEventStatsRow).toHaveBeenLastCalledWith(
        from,
        { ...from, startDate: '2026-06-01' },
        counted,
        expect.any(String)
      )
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'storeOrganizerStatsDaysAsKeys' }], directEvent)
    })

    it('fails the run and records nothing when a stats row keeps being counted on', async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeOrganizerStatsDaysAsKeys'))
      const instantRow = { count: 3, organizerId: 'org1', PK: 'ORG#org1', SK: '2026-05-31T21:00:00.000Z#event1' }
      mockReadAllOrganizerEventStats.mockResolvedValueOnce([structuredClone(instantRow)])
      mockMoveOrganizerEventStatsRow.mockRejectedValue(
        Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException' })
      )
      mockReadOrganizerEventStatsRow.mockImplementation(async () => structuredClone(instantRow))

      await runMigrationLambda(directEvent)

      expect(mockResponse).toHaveBeenCalledWith(409, { error: expect.stringContaining('kept changing') }, directEvent)
      // As many moves as a save makes of the row (ORGANIZER_STATS_MOVE_RETRY).
      expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledTimes(8)
      expect(mockMarkApplied).not.toHaveBeenCalled()
      mockMoveOrganizerEventStatsRow.mockReset()
      mockReadOrganizerEventStatsRow.mockReset()
    })

    // Measured on dev: some days were stored an hour off, a winter day's midnight worked out with the
    // summer offset (23:00 the evening before in Helsinki) and the reverse (01:00), and ends of day too.
    it('writes a day stored an hour off as the day it was stored for (GQ6rUY8RpY, WrGaAW3OCz)', async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeEventDaysAsKeys'))
      mockReadAllEvents.mockResolvedValueOnce([
        {
          classes: [{ class: 'ALO', date: '2026-11-06T21:00:00.000Z' }],
          endDate: '2026-11-07T21:00:00.000Z',
          entryEndDate: '2026-09-27T21:59:59.999Z',
          entryStartDate: '2026-10-01T22:00:00.000Z',
          id: 'GQ6rUY8RpY',
          startDate: '2026-11-06T21:00:00.000Z',
          updatedAt: 'read',
        },
      ])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
        'GQ6rUY8RpY',
        {
          set: {
            classes: [{ class: 'ALO', date: '2026-11-07' }],
            endDate: '2026-11-08',
            entryEndDate: '2026-09-27',
            entryStartDate: '2026-10-02',
            startDate: '2026-11-07',
            updatedAt: expect.any(String),
          },
        },
        'read'
      )
    })

    // The entry's days follow the event rule; the dog's dates are the day the instant falls on, so the
    // same Friday 23:00 is Saturday for a group and Friday for a birth date or a result.
    it("names a start's group by the day its date was stored for, and a dog's date by the day it falls on", async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeRegistrationDaysAsKeys'))
      mockReadRegistrationEventIds.mockResolvedValueOnce(['event1'])
      mockReadEventRegistrations.mockResolvedValueOnce([
        {
          dates: [{ date: '2025-12-12T21:00:00.000Z', time: 'ap' }],
          dog: {
            dob: '2026-11-06T21:00:00.000Z',
            regNo: 'FI1/21',
            results: [{ class: 'ALO', date: '2026-11-06T21:00:00.000Z', type: 'NOME-B' }],
          },
          eventId: 'event1',
          group: { date: '2025-12-12T21:00:00.000Z', key: '2025-12-12-ap', number: 1, time: 'ap' },
          id: 'reg1',
          results: [{ class: 'ALO', date: '2026-11-06T21:00:00.000Z', id: 'm1', type: 'NOME-B' }],
          startGroup: { date: '2025-12-12T21:00:00.000Z', key: '2025-12-12-ap', number: 1, time: 'ap' },
          updatedAt: 'read',
        },
      ])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedRegistration).toHaveBeenCalledWith(
        'event1',
        'reg1',
        {
          set: {
            dates: [{ date: '2025-12-13', time: 'ap' }],
            'dog.dob': '2026-11-06',
            'dog.results': [{ class: 'ALO', date: '2026-11-06', type: 'NOME-B' }],
            'group.date': '2025-12-13',
            'group.key': '2025-12-13-ap',
            results: [{ class: 'ALO', date: '2026-11-06', id: 'm1', type: 'NOME-B' }],
            'startGroup.date': '2025-12-13',
            'startGroup.key': '2025-12-13-ap',
            updatedAt: expect.any(String),
          },
        },
        'read'
      )
    })

    it('moves a stats row keyed an hour off to the key of the day it was stored for', async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeOrganizerStatsDaysAsKeys'))
      const row = { count: 2, organizerId: 'org1', PK: 'ORG#org1', SK: '2026-01-02T21:00:00.000Z#E8vPbdTCXn' }
      mockReadAllOrganizerEventStats.mockResolvedValueOnce([structuredClone(row)])

      await runMigrationLambda(directEvent)

      const from = { id: 'E8vPbdTCXn', organizer: { id: 'org1' }, startDate: '2026-01-02T21:00:00.000Z' }
      expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledWith(
        from,
        { ...from, startDate: '2026-01-03' },
        row,
        expect.any(String)
      )
    })

    // Dev holds days in offset form, as e2e runs wrote them: 84 event starts and 49 stats keys.
    describe('a day stored in offset form', () => {
      it('writes an event day in offset form as its day: summer and winter starts and an end of day', async () => {
        mockReadApplied.mockResolvedValue(pendingOnly('storeEventDaysAsKeys'))
        mockReadAllEvents.mockResolvedValueOnce([
          {
            endDate: '2026-09-03T00:00:00.000+03:00',
            entryEndDate: '2026-08-20T23:59:59.999+03:00',
            entryStartDate: '2026-02-01T00:00:00.000+02:00',
            id: 'event1',
            startDate: '2026-09-02T00:00:00.000+03:00',
            updatedAt: 'read',
          },
        ])

        await runMigrationLambda(directEvent)

        expect(mockWriteMigratedEvent).toHaveBeenCalledWith(
          'event1',
          {
            set: {
              endDate: '2026-09-03',
              entryEndDate: '2026-08-20',
              entryStartDate: '2026-02-01',
              startDate: '2026-09-02',
              updatedAt: expect.any(String),
            },
          },
          'read'
        )
      })

      it("writes an entry's days and its group in offset form as their days", async () => {
        mockReadApplied.mockResolvedValue(pendingOnly('storeRegistrationDaysAsKeys'))
        mockReadRegistrationEventIds.mockResolvedValueOnce(['event1'])
        mockReadEventRegistrations.mockResolvedValueOnce([
          {
            dates: [
              { date: '2026-09-02T00:00:00.000+03:00', time: 'ap' },
              { date: '2026-02-01T00:00:00.000+02:00', time: 'ip' },
            ],
            eventId: 'event1',
            group: { date: '2026-09-02T00:00:00.000+03:00', key: '2026-09-01-ap', number: 1, time: 'ap' },
            id: 'reg1',
            updatedAt: 'read',
          },
        ])

        await runMigrationLambda(directEvent)

        expect(mockWriteMigratedRegistration).toHaveBeenCalledWith(
          'event1',
          'reg1',
          {
            set: {
              dates: [
                { date: '2026-09-02', time: 'ap' },
                { date: '2026-02-01', time: 'ip' },
              ],
              'group.date': '2026-09-02',
              'group.key': '2026-09-02-ap',
              updatedAt: expect.any(String),
            },
          },
          'read'
        )
      })

      it.each([
        ['a summer start', '2026-09-02T00:00:00.000+03:00', '2026-09-02'],
        ['a winter start', '2026-02-01T00:00:00.000+02:00', '2026-02-01'],
      ])('moves a stats row keyed by %s in offset form to the key of its day', async (_name, startDate, day) => {
        mockReadApplied.mockResolvedValue(pendingOnly('storeOrganizerStatsDaysAsKeys'))
        const row = { count: 1, organizerId: 'org1', PK: 'ORG#org1', SK: `${startDate}#event1` }
        mockReadAllOrganizerEventStats.mockResolvedValueOnce([structuredClone(row)])

        await runMigrationLambda(directEvent)

        const from = { id: 'event1', organizer: { id: 'org1' }, startDate }
        expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledWith(
          from,
          { ...from, startDate: day },
          row,
          expect.any(String)
        )
      })
    })

    it("moves an organizer's stats row keyed by an instant to the key of its day", async () => {
      mockReadApplied.mockResolvedValue(pendingOnly('storeOrganizerStatsDaysAsKeys'))
      const instantRow = {
        count: 3,
        date: '2026-05-31T21:00:00.000Z',
        organizerId: 'org1',
        PK: 'ORG#org1',
        SK: '2026-05-31T21:00:00.000Z#event1',
        updatedAt: 'read',
      }
      const keyRow = { ...instantRow, date: '2026-07-01', SK: '2026-07-01#event2' }
      mockReadAllOrganizerEventStats.mockResolvedValueOnce([structuredClone(instantRow), keyRow])

      await runMigrationLambda(directEvent)

      expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledTimes(1)
      expect(mockMoveOrganizerEventStatsRow).toHaveBeenCalledWith(
        { id: 'event1', organizer: { id: 'org1' }, startDate: '2026-05-31T21:00:00.000Z' },
        { id: 'event1', organizer: { id: 'org1' }, startDate: '2026-06-01' },
        instantRow,
        expect.any(String)
      )
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'storeOrganizerStatsDaysAsKeys' }], directEvent)
    })
  })

  describe('the owner selections a registration stored without (KOE-1598)', () => {
    const directEvent = constructPartialAPIGwEvent({})
    const conflict = () =>
      Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' })

    let hashes: Map<string, string>
    const pendingOnly = (name: string) => new Map([...hashes].filter(([applied]) => applied !== name))

    beforeEach(async () => {
      hashes = new Map()
      mockMarkApplied.mockImplementation(async (name: string, _count: number, hash: string) => {
        hashes.set(name, hash)
      })
      mockReadAllEvents.mockResolvedValueOnce([])
      await runMigrationLambda(event)
      vi.clearAllMocks()
      mockMarkApplied.mockResolvedValue(undefined)
      mockReadApplied.mockResolvedValue(pendingOnly('storeOwnerSelections'))
      mockReadAllDogs.mockResolvedValue([])
      mockReadAllOrganizerEventStats.mockResolvedValue([])
      mockReadRegistrationEventIds.mockResolvedValue(['event1'])
    })

    const owner = { email: 'Owner@Example.com', membership: false, name: 'Olli Omistaja' }
    const row = (id: string, fields: Record<string, unknown>) => ({
      dog: { regNo: 'FI1/21' },
      eventId: 'event1',
      id,
      owner,
      updatedAt: 'read',
      ...fields,
    })
    const selectionsWritten = (id: string, ownerHandles: boolean, ownerPays: boolean) =>
      expect(mockWriteMigratedRegistration).toHaveBeenCalledWith(
        'event1',
        id,
        { set: { ownerHandles, ownerPays, updatedAt: expect.not.stringMatching(/^read$/) } },
        'read'
      )

    it('keeps a separate member handler as someone else, so the membership reading stays as it was', async () => {
      const handler = { email: 'handler@example.com', membership: true, name: 'Hanna Ohjaaja' }
      const stored = row('reg1', { handler, payer: { email: ' owner@example.com ', name: 'olli omistaja' } })
      expect(isMember(stored)).toBe(false)
      mockReadEventRegistrations.mockResolvedValueOnce([stored])

      await runMigrationLambda(directEvent)

      selectionsWritten('reg1', false, true)
      // The 2024 rows whose separate handler is the only member read as members before and after.
      expect(isMember({ ...stored, ownerHandles: false })).toBe(true)
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'storeOwnerSelections' }], directEvent)
    })

    it.each([
      ['no stored handler or payer', {}, true, true],
      ['an empty stored handler and payer', { handler: { name: '', phone: '' }, payer: { email: '' } }, true, true],
      [
        'the owner mirrored as handler, a separate payer',
        { handler: owner, payer: { name: 'Paavo Maksaja' } },
        true,
        false,
      ],
      [
        'a handler with the same name but another address',
        { handler: { email: 'x@example.com', name: owner.name } },
        false,
        true,
      ],
    ])('gives a row with %s the selections it meant', async (_case, fields, ownerHandles, ownerPays) => {
      mockReadEventRegistrations.mockResolvedValueOnce([row('reg1', fields)])

      await runMigrationLambda(directEvent)

      selectionsWritten('reg1', ownerHandles, ownerPays)
    })

    it('compares a stored person with the first owner of the owner list', async () => {
      const owners = [
        { email: 'first@example.com', key: 'owner-1', name: 'First' },
        { email: 'second@example.com', key: 'owner-2', name: 'Second' },
      ]
      mockReadEventRegistrations.mockResolvedValueOnce([
        row('reg1', {
          handler: { email: 'second@example.com', name: 'Second' },
          owner: undefined,
          owners,
          payer: owners[0],
        }),
      ])

      await runMigrationLambda(directEvent)

      selectionsWritten('reg1', false, true)
    })

    it('writes only the selection a row lacks, and leaves a row holding both and a status-only row as they are', async () => {
      mockReadEventRegistrations.mockResolvedValueOnce([
        row('reg1', { handler: { name: 'Hanna Ohjaaja' }, ownerHandles: 'owner-1' }),
        row('reg2', { ownerHandles: true, ownerPays: false }),
        { emailDeliveryStatus: { status: 'bounce' }, eventId: 'event1', id: 'reg3' },
      ])

      await runMigrationLambda(directEvent)

      expect(mockWriteMigratedRegistration).toHaveBeenCalledTimes(1)
      expect(mockWriteMigratedRegistration).toHaveBeenCalledWith(
        'event1',
        'reg1',
        { set: { ownerPays: true, updatedAt: expect.any(String) } },
        'read'
      )
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'storeOwnerSelections' }], directEvent)
    })

    it('writes nothing when a save gave the row its selections meanwhile', async () => {
      mockReadEventRegistrations.mockResolvedValueOnce([row('reg1', {})])
      mockWriteMigratedRegistration.mockRejectedValueOnce(conflict())
      mockReadRegistration.mockResolvedValueOnce(
        row('reg1', { ownerHandles: true, ownerPays: true, updatedAt: 'saved' })
      )

      await runMigrationLambda(directEvent)

      expect(mockReadRegistration).toHaveBeenCalledWith('event1', 'reg1', true)
      expect(mockWriteMigratedRegistration).toHaveBeenCalledTimes(1)
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 0, name: 'storeOwnerSelections' }], directEvent)
    })
  })
})
