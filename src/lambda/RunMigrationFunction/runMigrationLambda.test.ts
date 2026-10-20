import { vi } from 'vitest'
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
// is persistence, tested in lib/stats.
vi.doMock('../lib/stats', () => ({
  moveOrganizerEventStats: mockMoveOrganizerEventStats,
}))

vi.doMock('../lib/repositories/eventRepository', () => ({
  readAllEvents: mockReadAllEvents,
  readEvent: mockReadEvent,
  writeMigratedEvent: mockWriteMigratedEvent,
}))

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
    roles = 0
  ) => [
    { count: updatedAt, name: 'populateUpdatedAt' },
    { count: organizerId, name: 'backfillOrganizerId' },
    { count: season, name: 'fixSeasonFromStartDate' },
    { count: startNumbers, name: 'backfillStartNumbersPublished' },
    { count: repointed, name: 'repointOrphanOrganizer' },
    { count: roles, name: 'repointOrphanOrganizerRoles' },
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
    expect(mockWriteMigratedEvent).toHaveBeenCalledWith(...updatedRow('event1', { season: '2025' }))
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 1), event)
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
      expect(mockMarkApplied).not.toHaveBeenCalled()

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
      expect(mockMarkApplied).not.toHaveBeenCalled()
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
      'repointOrphanOrganizerRoles',
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

      expect(mockMarkApplied).toHaveBeenCalledTimes(6)
      expect(mockMarkApplied).toHaveBeenCalledWith('fixSeasonFromStartDate', 2, hashes.get('fixSeasonFromStartDate'))
      expect(mockMarkApplied).toHaveBeenCalledWith('populateUpdatedAt', 0, hashes.get('populateUpdatedAt'))
      expect(new Set(hashes.values()).size).toBe(6)
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
      expect(mockMarkApplied).not.toHaveBeenCalled()
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
})
