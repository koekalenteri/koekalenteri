import { vi } from 'vitest'

const broadcastConfigurations: unknown[] = []
const mockBroadcast = vi.fn((configuration: unknown) => {
  broadcastConfigurations.push(configuration)
  return Promise.resolve({ attempted: 0, failed: 0, gone: 0, sent: 0 })
})
const mockRemoveConnection = vi.fn().mockResolvedValue(undefined)
const mockEventAudience = vi.fn().mockReturnValue([])
const mockOrganizerAudience = vi.fn().mockReturnValue([])
const mockPublicAudience = vi.fn().mockReturnValue([])
const mockRegistrationAudience = vi.fn().mockReturnValue([])
const mockAdminAudience = vi.fn().mockReturnValue([])
const mockBuildEventPatchPayload = vi.fn((eventId: string, patch: object) => ({ eventId, ...patch }))
const mockBuildEventViewersPayload = vi.fn((eventId: string, viewers: unknown[]) => ({ eventId, viewers }))
const mockBuildRegistrationPatchPayload = vi.fn((eventId: string, patch: unknown[]) => ({ eventId, patch }))
const mockToEventViewers = vi.fn((audience: unknown[]) => audience)

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
  publishAdminDataInvalidation,
  publishEventViewers,
} = await import('./actions')

describe('ws/actions', () => {
  beforeEach(() => {
    broadcastConfigurations.length = 0
    mockBroadcast.mockClear()
    mockRemoveConnection.mockClear()
    mockEventAudience.mockClear()
    mockOrganizerAudience.mockClear()
    mockPublicAudience.mockClear()
    mockAdminAudience.mockClear()
    mockBuildEventPatchPayload.mockClear()
    mockBuildEventViewersPayload.mockClear()
    mockBuildRegistrationPatchPayload.mockClear()
    mockToEventViewers.mockClear()
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

  it('publishAdminDataInvalidation sends collection names to the admin audience', async () => {
    await publishAdminDataInvalidation(['users', 'organizers'])

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

    const call = broadcastConfigurations[0] as { onGoneConnection: (id: string) => Promise<void> } | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    await call.onGoneConnection('gone-1')

    expect(mockRemoveConnection).toHaveBeenCalledWith('gone-1')
  })
})
