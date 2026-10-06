import { vi } from 'vitest'
import { httpError } from '../lib/lambda'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockAuthorize = vi.fn()
const mockReadAll = vi.fn()
const mockRead = vi.fn()
const mockUpdate = vi.fn()
const mockReadApplied = vi.fn()
const mockMarkApplied = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
  authorizeAdmin: async (event: any) => {
    const user = await mockAuthorize(event)
    if (!user) throw httpError(401, 'Unauthorized')
    if (!user.admin) throw httpError(403, 'Forbidden')
    return user
  },
}))

vi.doMock('../lib/dataVersions', () => ({
  markMigrationApplied: mockMarkApplied,
  readAppliedMigrations: mockReadApplied,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      read: mockRead,
      readAll: mockReadAll,
      update: mockUpdate,
    }
  }),
}))

const { default: runMigrationLambda } = await import('./handler')

/** What the lambda sends for a migrated row: its key, the changed fields only, and the condition. */
const updatedRow = (id: string | undefined, set: object = {}) =>
  [
    id ? { id } : expect.anything(),
    { set: expect.objectContaining(set) },
    undefined,
    undefined,
    expect.anything(),
  ] as const

describe('runMigrationLambda', () => {
  const migrationResults = (updatedAt: number, season: number, startNumbers = 0, organizerId = 0) => [
    { count: updatedAt, name: 'populateUpdatedAt' },
    { count: organizerId, name: 'backfillOrganizerId' },
    { count: season, name: 'fixSeasonFromStartDate' },
    { count: startNumbers, name: 'backfillStartNumbersPublished' },
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

    mockReadAll.mockResolvedValue([
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

    mockUpdate.mockResolvedValue({})
    mockReadApplied.mockResolvedValue(new Map())
    mockMarkApplied.mockResolvedValue(undefined)
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
    expect(mockUpdate).toHaveBeenCalledTimes(2)

    // Verify first event was updated with correct season
    expect(mockUpdate).toHaveBeenCalledWith(...updatedRow('event1', { season: '2025' }))

    // Verify second event was updated with correct season
    expect(mockUpdate).toHaveBeenCalledWith(...updatedRow('event2', { season: '2025' }))

    // Verify response was returned with per-migration results
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 2), event)
  })

  it('does not update events that already have season field', async () => {
    await runMigrationLambda(event)

    // Verify events were retrieved
    expect(mockReadAll).toHaveBeenCalled()

    // Verify event with season field was not updated
    expect(mockUpdate).not.toHaveBeenCalledWith(...updatedRow('event3', {}))
  })

  it('updates events that have incorrect season for start date', async () => {
    mockReadAll.mockResolvedValueOnce([
      {
        id: 'event1',
        season: '2024',
        startDate: '2025-01-01',
        updatedAt: 'kept',
      },
    ])

    await runMigrationLambda(event)

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      ...updatedRow('event1', {
        season: '2025',

        updatedAt: expect.any(String),
      })
    )
    // Every modified row gets the shared updatedAt bump, whatever migration touched it
    expect(mockUpdate).not.toHaveBeenCalledWith(...updatedRow(undefined, { updatedAt: 'kept' }))
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 1), event)
  })

  it('uses zoned date in TIME_ZONE to determine season year', async () => {
    mockReadAll.mockResolvedValueOnce([
      {
        id: 'event1',
        season: '2024',
        startDate: '2024-12-31T22:30:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ])

    await runMigrationLambda(event)

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(...updatedRow('event1', { season: '2025' }))
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 1), event)
  })

  it('gives a missing updatedAt the shared bump value', async () => {
    mockReadAll.mockResolvedValueOnce([
      {
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        season: '2026',
        startDate: '2026-01-01',
      },
    ])

    await runMigrationLambda(event)

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(...updatedRow('event1', { updatedAt: expect.any(String) }))
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(1, 0), event)
  })

  it('does not touch an event that already has updatedAt', async () => {
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

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), event)
  })

  it('gives updatedAt the shared bump value even when modifiedAt is invalid', async () => {
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

    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenCalledWith(...updatedRow('event1', { updatedAt: expect.any(String) }))
    expect(mockUpdate).toHaveBeenCalledWith(...updatedRow('event2', { updatedAt: expect.any(String) }))
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(2, 0), event)
  })

  it('returns migration results with zero count if no events need updating', async () => {
    mockReadAll.mockResolvedValueOnce([
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
    expect(mockReadAll).toHaveBeenCalled()

    // Verify no events were updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify response was returned with count of 0
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), event)
  })

  it('returns migration results with zero count if no events are found', async () => {
    mockReadAll.mockResolvedValueOnce(null)

    await runMigrationLambda(event)

    // Verify events were attempted to be retrieved
    expect(mockReadAll).toHaveBeenCalled()

    // Verify no events were updated
    expect(mockUpdate).not.toHaveBeenCalled()

    // Verify response was returned with count of 0
    expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0), event)
  })

  // Skip the test for handling invalid startDate as it requires more complex mocking

  // gsiOrganizerStartDate is keyed on a top-level copy of organizer.id; a row without the copy is
  // invisible to a club administrator's list until the migration writes it (KOE-1341).
  describe('backfillOrganizerId', () => {
    it('copies organizer.id to the row where it is missing or stale', async () => {
      mockReadAll.mockResolvedValue([
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

      expect(mockUpdate).toHaveBeenCalledTimes(2)
      expect(mockUpdate).toHaveBeenCalledWith(...updatedRow('event1', { organizerId: 'org1' }))
      expect(mockUpdate).toHaveBeenCalledWith(...updatedRow('event2', { organizerId: 'org2' }))
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0, 2), event)
    })
  })

  describe('backfillStartNumbersPublished', () => {
    it('writes an explicit false when the start list is unpublished', async () => {
      mockReadAll.mockResolvedValueOnce([
        { id: 'event1', season: '2026', startDate: '2026-01-01', startListPublished: false, updatedAt: 'kept' },
      ])

      await runMigrationLambda(event)

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith(
        ...updatedRow('event1', { startNumbersPublished: false, updatedAt: expect.any(String) })
      )
      // The incremental fetch reads updatedAt, so the backfill must move it
      expect(mockUpdate).not.toHaveBeenCalledWith(...updatedRow(undefined, { updatedAt: 'kept' }))
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

      expect(mockUpdate).toHaveBeenCalledWith(
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
      mockReadAll.mockResolvedValueOnce([
        { id: 'event1', season: '2026', startDate: '2026-01-01', startListPublished, updatedAt: 'kept' },
      ])

      await runMigrationLambda(event)

      expect(mockUpdate).not.toHaveBeenCalled()
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

      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0), event)
    })
  })
  describe('registry of applied migrations', () => {
    const allNames = [
      'populateUpdatedAt',
      'backfillOrganizerId',
      'fixSeasonFromStartDate',
      'backfillStartNumbersPublished',
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
      mockReadAll.mockResolvedValueOnce([])
      await runMigrationLambda(event)
      vi.clearAllMocks()
      mockMarkApplied.mockResolvedValue(undefined)
    })

    it('forces a full run from the admin path without consulting the registry', async () => {
      mockReadApplied.mockResolvedValue(registryWith(allNames))

      await runMigrationLambda(event)

      expect(mockReadApplied).not.toHaveBeenCalled()
      expect(mockReadAll).toHaveBeenCalledTimes(1)
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 2), event)
    })

    it('records every migration of a forced run, with the hash of its code', async () => {
      await runMigrationLambda(event)

      expect(mockMarkApplied).toHaveBeenCalledTimes(4)
      expect(mockMarkApplied).toHaveBeenCalledWith('fixSeasonFromStartDate', 2, hashes.get('fixSeasonFromStartDate'))
      expect(mockMarkApplied).toHaveBeenCalledWith('populateUpdatedAt', 0, hashes.get('populateUpdatedAt'))
      expect(new Set(hashes.values()).size).toBe(4)
    })

    it('reads the registry once, for every migration in the code', async () => {
      await runMigrationLambda(directEvent)

      expect(mockReadApplied).toHaveBeenCalledTimes(1)
      expect(mockReadApplied).toHaveBeenCalledWith(allNames)
    })

    it('returns without reading the event table when nothing is missing', async () => {
      mockReadApplied.mockResolvedValue(registryWith(allNames))

      await runMigrationLambda(directEvent)

      expect(mockReadAll).not.toHaveBeenCalled()
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockMarkApplied).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(200, [], directEvent)
    })

    it('runs a migration again when its stored hash differs from the code', async () => {
      mockReadApplied.mockResolvedValue(new Map([...registryWith(allNames), ['backfillOrganizerId', 'old-hash']]))
      mockReadAll.mockResolvedValueOnce([organizerRow()])

      await runMigrationLambda(directEvent)

      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'backfillOrganizerId' }], directEvent)
    })

    it('does not run a migration whose stored hash equals the code', async () => {
      mockReadApplied.mockResolvedValue(registryWith(allNames))

      await runMigrationLambda(directEvent)

      expect(mockReadAll).not.toHaveBeenCalled()
    })

    it('treats a registry row without a hash as pending', async () => {
      mockReadApplied.mockResolvedValue(new Map([...registryWith(allNames), ['backfillOrganizerId', undefined]]))
      mockReadAll.mockResolvedValueOnce([organizerRow()])

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
      expect(mockReadAll).not.toHaveBeenCalled()
    })

    it('reads the event table once and runs only the missing migrations', async () => {
      mockReadApplied.mockResolvedValue(allButOrganizer())
      mockReadAll.mockResolvedValueOnce([organizerRow(), { ...organizerRow(), id: 'event2', organizerId: 7 }])

      await runMigrationLambda(directEvent)

      expect(mockReadAll).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith(
        ...updatedRow('event1', { organizerId: 7, updatedAt: expect.not.stringMatching(/^kept$/) })
      )
      expect(mockResponse).toHaveBeenCalledWith(200, [{ count: 1, name: 'backfillOrganizerId' }], directEvent)
    })

    it('does not run an applied migration even when its rows would change', async () => {
      mockReadApplied.mockResolvedValue(registryWith(['fixSeasonFromStartDate']))
      mockReadAll.mockResolvedValueOnce([{ id: 'event1', season: '2024', startDate: '2025-01-01', updatedAt: 'kept' }])

      await runMigrationLambda(directEvent)

      expect(mockUpdate).not.toHaveBeenCalledWith(...updatedRow('event1', {}))
    })

    it('records each migration it ran, with its count, after the writes', async () => {
      mockReadApplied.mockResolvedValue(allButOrganizer())
      mockReadAll.mockResolvedValueOnce([organizerRow()])

      await runMigrationLambda(directEvent)

      expect(mockMarkApplied).toHaveBeenCalledTimes(1)
      expect(mockMarkApplied).toHaveBeenCalledWith('backfillOrganizerId', 1, hashes.get('backfillOrganizerId'))
    })

    it('records nothing when a write fails', async () => {
      mockReadApplied.mockResolvedValue(allButOrganizer())
      mockReadAll.mockResolvedValueOnce([organizerRow()])
      mockUpdate.mockRejectedValueOnce(new Error('write failed'))

      await expect(runMigrationLambda(directEvent)).rejects.toThrow('write failed')

      expect(mockMarkApplied).not.toHaveBeenCalled()
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

    // The key attribute and the updatedAt the row had when it was read: a deleted row must not come
    // back as a stub of the migrated fields, and a row someone moved must not be written over.
    const existsAndUnchanged = (read: string) => ({
      expression: 'attribute_exists(#id) AND #updatedAt = :read',
      names: { '#id': 'id', '#updatedAt': 'updatedAt' },
      values: { ':read': read },
    })

    beforeEach(() => {
      mockReadApplied.mockResolvedValue(new Map())
    })

    it('sends only the fields the migrations changed, so fields written meanwhile are not undone', async () => {
      mockReadAll.mockResolvedValueOnce([readRow()])

      await runMigrationLambda(directEvent)

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event1' },
        { set: { organizerId: 7, updatedAt: expect.any(String) } },
        undefined,
        undefined,
        existsAndUnchanged('read')
      )
    })

    it('requires the row to exist, and to have no updatedAt when it had none', async () => {
      const { updatedAt: _updatedAt, ...withoutUpdatedAt } = readRow()
      mockReadAll.mockResolvedValueOnce([withoutUpdatedAt])

      await runMigrationLambda(directEvent)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event1' },
        { set: { organizerId: 7, updatedAt: expect.any(String) } },
        undefined,
        undefined,
        {
          expression: 'attribute_exists(#id) AND attribute_not_exists(#updatedAt)',
          names: { '#id': 'id', '#updatedAt': 'updatedAt' },
        }
      )
    })

    it('migrates the fresh row again after a conflict and sends only its own changes', async () => {
      mockReadAll.mockResolvedValueOnce([readRow()])
      mockUpdate.mockRejectedValueOnce(conflict())
      mockRead.mockResolvedValueOnce({ ...readRow(), name: 'saved by the secretary', updatedAt: 'secretary' })

      await runMigrationLambda(directEvent)

      expect(mockRead).toHaveBeenCalledWith({ id: 'event1' }, undefined, true)
      expect(mockUpdate).toHaveBeenCalledTimes(2)
      expect(mockUpdate).toHaveBeenLastCalledWith(
        { id: 'event1' },
        { set: { organizerId: 7, updatedAt: expect.any(String) } },
        undefined,
        undefined,
        existsAndUnchanged('secretary')
      )
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0, 1), directEvent)
    })

    it('fails the invocation and records nothing after three conflicts', async () => {
      mockReadAll.mockResolvedValueOnce([readRow()])
      mockUpdate.mockRejectedValue(conflict())
      mockRead.mockImplementation(async () => readRow())

      await runMigrationLambda(directEvent)

      expect(mockResponse).toHaveBeenCalledWith(409, { error: expect.stringContaining('kept changing') }, directEvent)
      expect(mockUpdate).toHaveBeenCalledTimes(3)
      expect(mockMarkApplied).not.toHaveBeenCalled()
    })

    it('does not write a row the other save already migrated', async () => {
      mockReadAll.mockResolvedValueOnce([readRow()])
      mockUpdate.mockRejectedValueOnce(conflict())
      mockRead.mockResolvedValueOnce({ ...readRow(), organizerId: 7, updatedAt: 'secretary' })

      await runMigrationLambda(directEvent)

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0, 0), directEvent)
    })

    it('does not recreate a row that was deleted meanwhile', async () => {
      mockReadAll.mockResolvedValueOnce([readRow()])
      mockUpdate.mockRejectedValueOnce(conflict())
      mockRead.mockResolvedValueOnce(undefined)

      await runMigrationLambda(directEvent)

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockResponse).toHaveBeenCalledWith(200, migrationResults(0, 0, 0, 0), directEvent)
    })
  })
})
