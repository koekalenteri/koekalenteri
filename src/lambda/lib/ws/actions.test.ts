import { vi } from 'vitest'
import { paymentPictureWith } from '../../../__mockData__/paymentPicture'
import { loggedLines } from '../../test-utils/logs'

/** What a publish hands the broadcaster: who gets it, and what they get. */
interface BroadcastConfiguration {
  audience: () => Promise<unknown[]>
  buildPayload: (audience?: unknown[]) => unknown
  onGoneConnection?: (id: string) => Promise<void>
}

const broadcastConfigurations: BroadcastConfiguration[] = []
const mockBroadcast = vi.fn((configuration: BroadcastConfiguration) => {
  broadcastConfigurations.push(configuration)
  return Promise.resolve({ attempted: 0, failed: 0, gone: 0, sent: 0 })
})
const mockRemoveConnection = vi.fn().mockResolvedValue(undefined)
const mockEventAudience = vi.fn().mockReturnValue([])
const mockOrganizerAudience = vi.fn().mockReturnValue([])
const mockPublicAudience = vi.fn().mockReturnValue([])
const mockRegistrationAudience = vi.fn().mockReturnValue([])
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
  publishPublicStartList: mockPublishPublicStartList,
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
  registrationAudience: mockRegistrationAudience,
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
  publishParticipantRegistrationPatch,
  publishParticipantRegistrationPatches,
  publishAdminDataInvalidation,
  publishEventViewers,
  publishEventChange,
  publishCancelledRegistration,
} = await import('./actions')

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

  it('publishes participant registration patches only to matching subscribers', async () => {
    const patch = { id: 'r1', paymentStatus: 'SUCCESS' as const }
    await publishParticipantRegistrationPatch('e1', 'r1', patch)

    const call = broadcastConfigurations[0] as { audience: () => Promise<unknown[]>; buildPayload: () => unknown }
    await call.audience()

    expect(mockRegistrationAudience).toHaveBeenCalledWith('e1', 'r1')
    expect(call.buildPayload()).toEqual({
      eventId: 'e1',
      patch,
      registrationId: 'r1',
      scope: 'participant:registration-patch',
    })
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
        expect.objectContaining({ eventId: 'e1', message: 'participant patch audience failed' }),
      ])
      errorSpy.mockRestore()
    })
  })

  // KOE-1526 review: the admins get what changed, the participant the payment state their page reads.
  it('publishes a cancelled payment to the admins as a change and to the participant as payment state', async () => {
    const patch = { eventId: 'e1', id: 'r1', paymentStatus: 'CANCEL' as const, updatedAt: '2026-08-01T00:00:00.000Z' }
    const participantPatch = { ...patch, payment: paymentPictureWith({ canPay: true, due: 50 }) }
    await publishCancelledRegistration({
      eventId: 'e1',
      organizerId: 'o1',
      participantPatch,
      patch,
      registrationId: 'r1',
    })

    expect(broadcastConfigurations.at(-1)?.buildPayload()).toEqual({
      eventId: 'e1',
      patch: participantPatch,
      registrationId: 'r1',
      scope: 'participant:registration-patch',
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
})
