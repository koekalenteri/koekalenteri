import { vi } from 'vitest'
import { asJsonConfirmedEvent } from '../../test-utils/helpers'
import { loggedLines } from '../../test-utils/logs'

/** What a publish hands the broadcaster: who gets it, and what they get. */
interface BroadcastConfiguration {
  audience: () => Promise<unknown[]>
  buildPayload: (audience?: unknown[]) => unknown
  onGoneConnection?: (id: string) => Promise<void>
}

const broadcastConfigurations: BroadcastConfiguration[] = []
const recordBroadcast = (configuration: BroadcastConfiguration) => {
  broadcastConfigurations.push(configuration)
  return Promise.resolve({ attempted: 0, failed: 0, gone: 0, sent: 0 })
}
const mockBroadcast = vi.fn(recordBroadcast)
const mockRemoveConnection = vi.fn().mockResolvedValue(undefined)
const mockEventAudience = vi.fn().mockReturnValue([])
const mockOrganizerAudience = vi.fn().mockReturnValue([])
const mockPublicAudience = vi.fn().mockReturnValue([])
const mockRegistrationsAudience = vi.fn().mockResolvedValue([])
const mockAdminAudience = vi.fn().mockReturnValue([])
const mockBuildEventPatchPayload = vi.fn((eventId: string, patch: object) => ({ eventId, ...patch }))
const mockBuildEventViewersPayload = vi.fn((eventId: string, viewers: unknown[]) => ({ eventId, viewers }))
const mockBuildRegistrationPatchPayload = vi.fn((eventId: string, patch: unknown[]) => ({ eventId, patch }))
const mockToEventViewers = vi.fn((audience: unknown[]) => audience)
const mockBumpDataVersion = vi.fn().mockResolvedValue(undefined)
const mockPublishPublicStartList = vi.fn().mockResolvedValue(undefined)

// The version bump writes to DynamoDB; unmocked, it reached for real credentials and logged the refusal.
vi.doMock('../dataVersions', () => ({
  bumpDataVersion: mockBumpDataVersion,
}))

vi.doMock('./publicStartList', () => ({
  sendPublicStartList: mockPublishPublicStartList,
}))

vi.doMock('./broadcast', () => ({
  broadcast: mockBroadcast,
}))

vi.doMock('./connectionRepository', () => ({
  removeConnection: mockRemoveConnection,
}))

vi.doMock('./connectionSelectors', () => ({
  adminAudience: mockAdminAudience,
  eventAudience: mockEventAudience,
  organizerAudience: mockOrganizerAudience,
  publicAudience: mockPublicAudience,
  registrationsAudience: mockRegistrationsAudience,
}))

vi.doMock('./payloads', () => ({
  buildEventPatchPayload: mockBuildEventPatchPayload,
  buildEventViewersPayload: mockBuildEventViewersPayload,
  buildRegistrationPatchPayload: mockBuildRegistrationPatchPayload,
  toEventViewers: mockToEventViewers,
}))

const {
  publishPublicEvent,
  publishAdminEventPatch,
  publishEventPatch,
  publishRegistrationPatches,
  publishRegistrationPatchesStrict,
  publishParticipantRegistrationPatches,
  publishAdminDataInvalidation,
  publishEventViewers,
  publishEventChange,
  publishEventCounts,
  publishEventCountsStrict,
  publishPublicStartList,
  publishPublicStartListStrict,
} = await import('./actions')

/** An event as recounted: what the counts publishers send on. */
const event = asJsonConfirmedEvent({
  classes: [],
  entries: 3,
  id: 'e1',
  members: 1,
  organizer: { id: 'org-1', name: 'Org' },
  updatedAt: '2026-10-21T00:00:00.000Z',
})

describe('ws/actions', () => {
  beforeEach(() => {
    broadcastConfigurations.length = 0
    mockBroadcast.mockClear()
    mockRemoveConnection.mockClear()
    mockPublishPublicStartList.mockClear()
    mockEventAudience.mockClear()
    mockOrganizerAudience.mockClear()
    mockPublicAudience.mockClear()
    mockAdminAudience.mockClear()
    mockBuildEventPatchPayload.mockClear()
    mockBuildEventViewersPayload.mockClear()
    mockBuildRegistrationPatchPayload.mockClear()
    mockToEventViewers.mockClear()
    mockRegistrationsAudience.mockReset().mockResolvedValue([])
  })

  it('publishPublicEvent sends public audience patch payload', async () => {
    await publishPublicEvent({ entries: 5, eventId: 'e1' })

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    const call = broadcastConfigurations[0] as
      | { audience: () => Promise<unknown[]>; buildPayload: () => unknown }
      | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    await call.audience()
    call.buildPayload()

    expect(mockPublicAudience).toHaveBeenCalledTimes(1)
    expect(call.buildPayload()).toEqual({ entries: 5, eventId: 'e1', scope: 'public:event-patch' })
    expect(mockBuildEventPatchPayload).toHaveBeenCalledWith('e1', { entries: 5, eventId: 'e1' })
  })

  it('publishPublicEvent excludes specified connection ids from public audience', async () => {
    mockPublicAudience.mockResolvedValueOnce([{ connectionId: 'c1' }, { connectionId: 'c2' }, { connectionId: 'c3' }])

    await publishPublicEvent({ entries: 5, eventId: 'e1' }, ['c2'])

    const call = broadcastConfigurations[0] as { audience: () => Promise<Array<{ connectionId: string }>> } | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    await expect(call.audience()).resolves.toEqual([{ connectionId: 'c1' }, { connectionId: 'c3' }])
  })

  it('publishAdminEventPatch sends organizer audience patch payload', async () => {
    await publishAdminEventPatch({ eventId: 'e1', name: 'Updated' }, 'org-1')

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: expect.any(Function),
        buildPayload: expect.any(Function),
        onGoneConnection: expect.any(Function),
      })
    )
    const call = broadcastConfigurations[0] as
      | { audience: () => Promise<unknown[]>; buildPayload: () => unknown }
      | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    await call.audience()
    call.buildPayload()

    expect(mockOrganizerAudience).toHaveBeenCalledWith('org-1', 'e1')
    expect(call.buildPayload()).toEqual({ eventId: 'e1', name: 'Updated', scope: 'admin:event-patch' })
    expect(mockBuildEventPatchPayload).toHaveBeenCalledWith('e1', { eventId: 'e1', name: 'Updated' })
  })

  it('publishes only admin patch when no public fields changed', async () => {
    await publishEventPatch({ eventId: 'e1', kcId: 123 }, 'org-1')

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
  })

  it('publishes null removal markers in admin patches', async () => {
    await publishEventPatch({ eventId: 'e1', kcId: null }, 'org-1')

    const call = broadcastConfigurations[0] as { buildPayload: () => unknown } | undefined
    expect(call?.buildPayload()).toEqual({ eventId: 'e1', kcId: null, scope: 'admin:event-patch' })
    expect(mockBroadcast).toHaveBeenCalledTimes(1)
  })

  it('publishes admin patch and derived public patch when public fields changed', async () => {
    mockOrganizerAudience.mockResolvedValueOnce([{ connectionId: 'a1' }])
    mockPublicAudience.mockResolvedValueOnce([{ connectionId: 'a1' }, { connectionId: 'p1' }])

    await publishEventPatch({ entries: 10, eventId: 'e1', name: 'Updated' }, 'org-1')

    expect(mockBroadcast).toHaveBeenCalledTimes(2)

    const publicCall = broadcastConfigurations[1] as
      | { audience: () => Promise<Array<{ connectionId: string }>>; buildPayload: () => unknown }
      | undefined
    expect(publicCall).toBeTruthy()
    if (!publicCall) throw new Error('missing public broadcast call')

    await expect(publicCall.audience()).resolves.toEqual([{ connectionId: 'p1' }])
    expect(publicCall.buildPayload()).toEqual({
      entries: 10,
      eventId: 'e1',
      name: 'Updated',
      scope: 'public:event-patch',
    })
  })

  it('marks the public half of a delete as deleted, since deletedAt is not a public field (KOE-1648)', async () => {
    await publishEventPatch(
      {
        deletedAt: '2026-10-27T10:00:00.000Z',
        deletedBy: 'Admin',
        eventId: 'e1',
        modifiedAt: '2026-10-27T10:00:00.000Z',
        updatedAt: '2026-10-27T10:00:00.000Z',
      },
      'org-1'
    )

    expect(mockBroadcast).toHaveBeenCalledTimes(2)
    expect(broadcastConfigurations[1]?.buildPayload()).toEqual({
      deleted: true,
      eventId: 'e1',
      modifiedAt: '2026-10-27T10:00:00.000Z',
      scope: 'public:event-patch',
      updatedAt: '2026-10-27T10:00:00.000Z',
    })
  })

  it('leaves the deleted mark off the public half of any other change', async () => {
    await publishEventPatch({ eventId: 'e1', name: 'Updated' }, 'org-1')

    expect(broadcastConfigurations[1]?.buildPayload()).not.toHaveProperty('deleted')
  })

  it('publishRegistrationPatches sends admin:event-registrations payload to organizer audience', async () => {
    const patch = [{ id: 'r1', state: 'ready' as const }]

    await publishRegistrationPatches('e1', patch, 'org-1')

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    const call = broadcastConfigurations[0] as
      | { audience: () => Promise<unknown[]>; buildPayload: () => unknown }
      | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    await call.audience()
    call.buildPayload()

    expect(mockOrganizerAudience).toHaveBeenCalledWith('org-1', 'e1')
    expect(mockBuildRegistrationPatchPayload).toHaveBeenCalledWith('e1', patch)
  })

  it('strict registration publication rejects failed deliveries', async () => {
    mockBroadcast.mockResolvedValueOnce({ attempted: 2, failed: 1, gone: 0, sent: 1 })

    await expect(publishRegistrationPatchesStrict('e1', [{ id: 'r1' }], 'org-1')).rejects.toThrow(
      'Failed to publish registration patches to 1 WebSocket connection(s)'
    )
  })

  describe('publishParticipantRegistrationPatches (KOE-1553)', () => {
    const connection = (connectionId: string, registrationId: string) => ({
      connectionId,
      registrationEventId: 'e1',
      registrationId,
    })
    const payload = (registrationId: string) => ({
      eventId: 'e1',
      patch: { id: registrationId, paymentStatus: 'SUCCESS' },
      registrationId,
      scope: 'participant:registration-patch',
    })

    it('scans nothing for no registrations', async () => {
      const buildPatch = vi.fn()

      await publishParticipantRegistrationPatches('e1', [], buildPatch)

      expect(mockRegistrationsAudience).not.toHaveBeenCalled()
      expect(buildPatch).not.toHaveBeenCalled()
      expect(mockBroadcast).not.toHaveBeenCalled()
    })

    it('builds nothing when no entrant has the page open', async () => {
      const buildPatch = vi.fn()

      await publishParticipantRegistrationPatches('e1', ['r1', 'r2'], buildPatch)

      expect(mockRegistrationsAudience).toHaveBeenCalledWith('e1', ['r1', 'r2'])
      expect(buildPatch).not.toHaveBeenCalled()
      expect(mockBroadcast).not.toHaveBeenCalled()
    })

    it('builds each watched registration once and gives every page its own patch', async () => {
      const watching = [connection('c1', 'r1'), connection('c2', 'r1'), connection('c3', 'r2'), connection('c4', 'r3')]
      mockRegistrationsAudience.mockResolvedValueOnce(watching)
      // r3's row is gone: nothing to send it.
      const buildPatch = vi.fn(async (registrationId: string) =>
        registrationId === 'r3' ? undefined : { id: registrationId, paymentStatus: 'SUCCESS' as const }
      )

      await publishParticipantRegistrationPatches('e1', ['r1', 'r2', 'r3', 'r4'], buildPatch)

      expect(buildPatch).toHaveBeenCalledTimes(3)
      expect(buildPatch).toHaveBeenCalledWith('r1')
      expect(buildPatch).toHaveBeenCalledWith('r2')
      expect(buildPatch).toHaveBeenCalledWith('r3')
      // One send per registration with a patch, to that registration's pages only.
      expect(mockBroadcast).toHaveBeenCalledTimes(2)
      const sent = await Promise.all(
        broadcastConfigurations.map(async (call) => ({ audience: await call.audience(), payload: call.buildPayload() }))
      )
      expect(sent).toEqual([
        { audience: watching.slice(0, 2), payload: payload('r1') },
        { audience: [watching[2]], payload: payload('r2') },
      ])
    })

    // A live push never decides the write's outcome: the caller has already committed it.
    it('logs a failed build and still sends the other registrations their patch', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRegistrationsAudience.mockResolvedValueOnce([connection('c1', 'r1'), connection('c2', 'r2')])
      const buildPatch = vi.fn(async (registrationId: string) => {
        if (registrationId === 'r1') throw new Error('read failed')
        return { id: registrationId, paymentStatus: 'SUCCESS' as const }
      })

      await expect(publishParticipantRegistrationPatches('e1', ['r1', 'r2'], buildPatch)).resolves.toBeUndefined()

      expect(mockBroadcast).toHaveBeenCalledTimes(1)
      expect(broadcastConfigurations[0].buildPayload()).toEqual(payload('r2'))
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({
          error: expect.objectContaining({ message: 'read failed' }),
          eventId: 'e1',
          message: 'participant patch failed',
          registrationId: 'r1',
        }),
      ])
      errorSpy.mockRestore()
    })

    it('logs a failed send without rejecting', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRegistrationsAudience.mockResolvedValueOnce([connection('c1', 'r1')])
      mockBroadcast.mockRejectedValueOnce(new Error('gateway down'))

      await expect(publishParticipantRegistrationPatches('e1', ['r1'], async (id) => ({ id }))).resolves.toBeUndefined()

      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({ message: 'participant patch failed', registrationId: 'r1' }),
      ])
      errorSpy.mockRestore()
    })

    it('logs a failed connection scan without rejecting or building', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRegistrationsAudience.mockRejectedValueOnce(new Error('scan failed'))
      const buildPatch = vi.fn()

      await expect(publishParticipantRegistrationPatches('e1', ['r1'], buildPatch)).resolves.toBeUndefined()

      expect(buildPatch).not.toHaveBeenCalled()
      expect(mockBroadcast).not.toHaveBeenCalled()
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({ message: 'live push failed', publication: 'participant registration patches' }),
      ])
      errorSpy.mockRestore()
    })
  })

  it('publishAdminDataInvalidation sends collection names to the admin audience', async () => {
    await publishAdminDataInvalidation(['users', 'organizers'])

    // Every collection but users gets its version bumped; users is versioned per organization.
    expect(mockBumpDataVersion).toHaveBeenCalledTimes(1)
    expect(mockBumpDataVersion).toHaveBeenCalledWith('organizers')

    const call = broadcastConfigurations[0] as
      | { audience: () => Promise<unknown[]>; buildPayload: () => unknown }
      | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    await call.audience()
    expect(mockAdminAudience).toHaveBeenCalledTimes(1)
    expect(call.buildPayload()).toEqual({
      collections: ['users', 'organizers'],
      scope: 'admin:data-invalidation',
    })
  })

  it('publishEventViewers builds viewers payload with all viewers', async () => {
    mockEventAudience.mockResolvedValueOnce([
      { connectionId: 'c1', userId: 'u1' },
      { connectionId: 'c2', userId: 'u2' },
    ])
    mockToEventViewers.mockImplementationOnce((audience: unknown[]) =>
      (audience as Array<{ userId: string }>).map(({ userId }) => ({ name: userId, userId }))
    )

    await publishEventViewers('e1', 'org-1')

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    const call = broadcastConfigurations[0] as
      | {
          audience: () => Promise<Array<{ connectionId: string; userId: string }>>
          buildPayload: (audience: Array<{ connectionId: string; userId: string }>) => unknown
        }
      | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    const audience = await call.audience()
    call.buildPayload(audience)

    expect(mockEventAudience).toHaveBeenCalledWith('e1', 'org-1', {})
    expect(mockToEventViewers).toHaveBeenCalled()
    expect(mockBuildEventViewersPayload).toHaveBeenCalledWith('e1', [
      { name: 'u1', userId: 'u1' },
      { name: 'u2', userId: 'u2' },
    ])
  })

  it('publishEventViewers includes the same user only once when same user has multiple windows open', async () => {
    mockEventAudience.mockResolvedValueOnce([
      { connectionId: 'c1', userId: 'u1' },
      { connectionId: 'c2', userId: 'u1' },
    ])
    mockToEventViewers.mockImplementationOnce((audience: unknown[]) =>
      [...new Set((audience as Array<{ userId: string }>).map(({ userId }) => userId))].map((userId) => ({
        name: userId,
        userId,
      }))
    )

    await publishEventViewers('e1', 'org-1')

    const call = broadcastConfigurations[0] as
      | {
          audience: () => Promise<Array<{ connectionId: string; userId: string }>>
          buildPayload: (audience: Array<{ connectionId: string; userId: string }>) => unknown
        }
      | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    const audience = await call.audience()
    call.buildPayload(audience)

    expect(mockToEventViewers).toHaveBeenCalledWith([
      { connectionId: 'c1', userId: 'u1' },
      { connectionId: 'c2', userId: 'u1' },
    ])
    expect(mockBuildEventViewersPayload).toHaveBeenCalledWith('e1', [{ name: 'u1', userId: 'u1' }])
  })

  it('send uses onGoneConnection handler to remove a gone connection', async () => {
    await publishPublicEvent({ entries: 5, eventId: 'e1' })

    const call = broadcastConfigurations[0]
    expect(call?.onGoneConnection).toBeTruthy()
    if (!call?.onGoneConnection) throw new Error('missing broadcast call')

    await call.onGoneConnection('gone-1')

    expect(mockRemoveConnection).toHaveBeenCalledWith('gone-1')
  })

  describe('publishEventChange', () => {
    it('rebuilds the published start list by the event id alone when the change moved it (KOE-1516)', async () => {
      await publishEventChange({
        audience: 'public',
        organizerId: 'org-1',
        patch: { eventId: 'event-1', resultsPublished: { ALO: false } },
        startList: true,
      })

      expect(mockPublishPublicStartList).toHaveBeenCalledWith('event-1')
    })

    it('leaves the start list alone when the change did not move it', async () => {
      await publishEventChange({ audience: 'public', organizerId: 'org-1', patch: { eventId: 'event-1', name: 'x' } })

      expect(mockPublishPublicStartList).not.toHaveBeenCalled()
    })
  })

  describe('a push after a write never fails it (KOE-1583)', () => {
    const scanFailed = new Error('scan failed')
    const failEveryBroadcast = () => mockBroadcast.mockRejectedValue(scanFailed)

    afterEach(() => {
      mockBroadcast.mockImplementation(recordBroadcast)
      mockOrganizerAudience.mockReset().mockReturnValue([])
      mockBumpDataVersion.mockReset().mockResolvedValue(undefined)
      mockPublishPublicStartList.mockReset().mockResolvedValue(undefined)
    })

    it.each([
      ['public event patch', failEveryBroadcast, () => publishPublicEvent({ entries: 1, eventId: 'e1' })],
      ['admin event patch', failEveryBroadcast, () => publishAdminEventPatch({ entries: 1, eventId: 'e1' }, 'org-1')],
      ['registration patches', failEveryBroadcast, () => publishRegistrationPatches('e1', [{ id: 'r1' }], 'org-1')],
      ['event viewers', failEveryBroadcast, () => publishEventViewers('e1', 'org-1')],
      ['admin data invalidation', failEveryBroadcast, () => publishAdminDataInvalidation(['judges'])],
      [
        'public start list',
        () => mockPublishPublicStartList.mockRejectedValue(scanFailed),
        () => publishPublicStartList('e1'),
      ],
      [
        'participant registration patches',
        () => mockRegistrationsAudience.mockRejectedValue(scanFailed),
        () => publishParticipantRegistrationPatches('e1', ['r1'], vi.fn()),
      ],
      [
        'admin event patch',
        () => mockOrganizerAudience.mockRejectedValue(scanFailed),
        () => publishEventPatch({ entries: 1, eventId: 'e1' }, 'org-1'),
      ],
      ['public event patch', failEveryBroadcast, () => publishEventCounts(event)],
      [
        'public start list',
        () => mockPublishPublicStartList.mockRejectedValue(scanFailed),
        () =>
          publishEventChange({
            audience: 'public',
            organizerId: 'org-1',
            patch: { eventId: 'e1', resultsPublished: { ALO: false } },
            startList: true,
          }),
      ],
    ])('%s: logs the failure and resolves', async (publication, fail, publish) => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      fail()

      await expect(publish()).resolves.toBeUndefined()

      expect(loggedLines(errorSpy)).toContainEqual(
        expect.objectContaining({ message: 'live push failed', publication })
      )
      errorSpy.mockRestore()
    })

    it('sends the public half to every public page when the admins cannot be looked up', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockOrganizerAudience.mockRejectedValue(scanFailed)
      mockPublicAudience.mockResolvedValueOnce([{ connectionId: 'admin-1' }, { connectionId: 'public-1' }])

      await publishEventPatch({ entries: 4, eventId: 'e1' }, 'org-1')

      expect(broadcastConfigurations).toHaveLength(1)
      const [publicHalf] = broadcastConfigurations
      await expect(publicHalf?.audience()).resolves.toEqual([{ connectionId: 'admin-1' }, { connectionId: 'public-1' }])
      expect(publicHalf?.buildPayload()).toEqual({ entries: 4, eventId: 'e1', scope: 'public:event-patch' })
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({ message: 'live push failed', publication: 'admin event patch' }),
      ])
      errorSpy.mockRestore()
    })

    it('sends the public half to the admins too when their own half could not be sent', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockOrganizerAudience.mockResolvedValue([{ connectionId: 'admin-1' }])
      mockPublicAudience.mockResolvedValueOnce([{ connectionId: 'admin-1' }, { connectionId: 'public-1' }])
      mockBroadcast.mockRejectedValueOnce(scanFailed)

      await publishEventPatch({ entries: 4, eventId: 'e1' }, 'org-1')

      const [publicHalf] = broadcastConfigurations
      await expect(publicHalf?.audience()).resolves.toEqual([{ connectionId: 'admin-1' }, { connectionId: 'public-1' }])
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({ message: 'live push failed', publication: 'admin event patch' }),
      ])
      errorSpy.mockRestore()
    })

    it('still rejects when the stored data version cannot be bumped, before any push', async () => {
      mockBumpDataVersion.mockRejectedValue(new Error('version table down'))

      await expect(publishAdminDataInvalidation(['judges'])).rejects.toThrow('version table down')
      expect(mockBroadcast).not.toHaveBeenCalled()
    })
  })

  describe('strict variants for durable workflows', () => {
    afterEach(() => {
      mockBroadcast.mockImplementation(recordBroadcast)
      mockOrganizerAudience.mockReset().mockReturnValue([])
      mockPublishPublicStartList.mockReset().mockResolvedValue(undefined)
    })

    it('publishRegistrationPatchesStrict resolves with the counts of a push that went through', async () => {
      mockBroadcast.mockResolvedValueOnce({ attempted: 2, failed: 0, gone: 1, sent: 1 })

      await expect(publishRegistrationPatchesStrict('e1', [{ id: 'r1' }], 'org-1')).resolves.toEqual({
        attempted: 2,
        failed: 0,
        gone: 1,
        sent: 1,
      })
    })

    it('publishRegistrationPatchesStrict rejects when the audience cannot be looked up', async () => {
      mockBroadcast.mockRejectedValueOnce(new Error('scan failed'))

      await expect(publishRegistrationPatchesStrict('e1', [{ id: 'r1' }], 'org-1')).rejects.toThrow('scan failed')
    })

    it('publishEventCountsStrict sends the admins and the public their halves', async () => {
      mockOrganizerAudience.mockResolvedValueOnce([{ connectionId: 'admin-1' }])
      mockPublicAudience.mockResolvedValueOnce([{ connectionId: 'admin-1' }, { connectionId: 'public-1' }])

      await expect(publishEventCountsStrict(event)).resolves.toBeUndefined()

      expect(broadcastConfigurations).toHaveLength(2)
      const [adminHalf, publicHalf] = broadcastConfigurations
      expect(adminHalf?.buildPayload()).toEqual(expect.objectContaining({ entries: 3, scope: 'admin:event-patch' }))
      await expect(publicHalf?.audience()).resolves.toEqual([{ connectionId: 'public-1' }])
    })

    it('publishEventCountsStrict rejects when the public half cannot be sent', async () => {
      mockBroadcast.mockImplementationOnce(recordBroadcast).mockRejectedValueOnce(new Error('public scan failed'))

      await expect(publishEventCountsStrict(event)).rejects.toThrow('public scan failed')

      expect(mockBroadcast).toHaveBeenCalledTimes(2)
    })

    it('publishEventCountsStrict rejects when the admins cannot be looked up', async () => {
      mockOrganizerAudience.mockRejectedValue(new Error('scan failed'))

      await expect(publishEventCountsStrict(event)).rejects.toThrow('scan failed')
      expect(mockBroadcast).not.toHaveBeenCalled()
    })

    it('publishPublicStartListStrict rejects when the list cannot be sent', async () => {
      mockPublishPublicStartList.mockRejectedValueOnce(new Error('read failed'))

      await expect(publishPublicStartListStrict('e1')).rejects.toThrow('read failed')
    })
  })
})
