import { jest } from '@jest/globals'

const mockBroadcast = jest.fn<any>().mockResolvedValue({ attempted: 0, failed: 0, gone: 0, sent: 0 })
const mockDisconnectWebSocket = jest.fn<any>().mockResolvedValue(undefined)
const mockEventAudience = jest.fn<any>().mockReturnValue([])
const mockOrganizerAudience = jest.fn<any>().mockReturnValue([])
const mockPublicAudience = jest.fn<any>().mockReturnValue([])
const mockAdminAudience = jest.fn<any>().mockReturnValue([])
const mockBuildConnectionCountPayload = jest.fn((scope: string, count: number) => ({ count, scope }))
const mockBuildEventPatchPayload = jest.fn((eventId: string, patch: object) => ({ eventId, ...patch }))
const mockBuildEventViewersPayload = jest.fn((eventId: string, viewers: unknown[]) => ({ eventId, viewers }))
const mockBuildRegistrationPatchPayload = jest.fn((eventId: string, patch: unknown[]) => ({ eventId, patch }))
const mockToEventViewers = jest.fn((audience: unknown[]) => audience)
const mockSubscribeToEvent = jest.fn<any>().mockResolvedValue(undefined)
const mockUnsubscribeFromEvent = jest.fn<any>().mockResolvedValue(undefined)
const mockSubscribeToAdmin = jest.fn<any>().mockResolvedValue({ adminSubscribed: true })
const mockUnsubscribeFromAdmin = jest.fn<any>().mockResolvedValue({ adminSubscribed: false })

jest.unstable_mockModule('./broadcast', () => ({
  broadcast: mockBroadcast,
}))

jest.unstable_mockModule('./connectionLifecycle', () => ({
  disconnectWebSocket: mockDisconnectWebSocket,
}))

jest.unstable_mockModule('./connectionSelectors', () => ({
  adminAudience: mockAdminAudience,
  eventAudience: mockEventAudience,
  organizerAudience: mockOrganizerAudience,
  publicAudience: mockPublicAudience,
}))

jest.unstable_mockModule('./payloads', () => ({
  buildConnectionCountPayload: mockBuildConnectionCountPayload,
  buildEventPatchPayload: mockBuildEventPatchPayload,
  buildEventViewersPayload: mockBuildEventViewersPayload,
  buildRegistrationPatchPayload: mockBuildRegistrationPatchPayload,
  toEventViewers: mockToEventViewers,
}))

jest.unstable_mockModule('./subscriptionService', () => ({
  subscribeToAdmin: mockSubscribeToAdmin,
  subscribeToEvent: mockSubscribeToEvent,
  unsubscribeFromAdmin: mockUnsubscribeFromAdmin,
  unsubscribeFromEvent: mockUnsubscribeFromEvent,
}))

const {
  publishPublicEvent,
  publishAdminEventPatch,
  publishEventPatch,
  publishRegistrationPatches,
  publishEventViewers,
  publishAdminConnectionCount,
  publishConnectionCounts,
  publishPublicConnectionCount,
  subscribeWebSocketToAdmin,
  subscribeWebSocketToEvent,
  unsubscribeWebSocketFromAdmin,
  unsubscribeWebSocketFromEvent,
} = await import('./actions')

describe('ws/actions', () => {
  beforeEach(() => {
    mockBroadcast.mockClear()
    mockDisconnectWebSocket.mockClear()
    mockEventAudience.mockClear()
    mockOrganizerAudience.mockClear()
    mockPublicAudience.mockClear()
    mockAdminAudience.mockClear()
    mockBuildConnectionCountPayload.mockClear()
    mockBuildEventPatchPayload.mockClear()
    mockBuildEventViewersPayload.mockClear()
    mockBuildRegistrationPatchPayload.mockClear()
    mockToEventViewers.mockClear()
    mockSubscribeToAdmin.mockClear()
    mockSubscribeToEvent.mockClear()
    mockUnsubscribeFromAdmin.mockClear()
    mockUnsubscribeFromEvent.mockClear()
  })

  it('publishPublicEvent sends public audience patch payload', async () => {
    await publishPublicEvent({ entries: 5, eventId: 'e1' })

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    const call = mockBroadcast.mock.calls[0]?.[0] as
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

    const call = mockBroadcast.mock.calls[0]?.[0] as
      | { audience: () => Promise<Array<{ connectionId: string }>> }
      | undefined
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
    const call = mockBroadcast.mock.calls[0]?.[0] as
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

    const call = mockBroadcast.mock.calls[0]?.[0] as { buildPayload: () => unknown } | undefined
    expect(call?.buildPayload()).toEqual({ eventId: 'e1', kcId: null, scope: 'admin:event-patch' })
    expect(mockBroadcast).toHaveBeenCalledTimes(1)
  })

  it('publishes admin patch and derived public patch when public fields changed', async () => {
    mockOrganizerAudience.mockResolvedValueOnce([{ connectionId: 'a1' }])
    mockPublicAudience.mockResolvedValueOnce([{ connectionId: 'a1' }, { connectionId: 'p1' }])

    await publishEventPatch({ entries: 10, eventId: 'e1', name: 'Updated' }, 'org-1')

    expect(mockBroadcast).toHaveBeenCalledTimes(2)

    const publicCall = mockBroadcast.mock.calls[1]?.[0] as
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
    const patch = [{ id: 'r1', state: 'invited' }]

    await publishRegistrationPatches('e1', patch as any, 'org-1')

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    const call = mockBroadcast.mock.calls[0]?.[0] as
      | { audience: () => Promise<unknown[]>; buildPayload: () => unknown }
      | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    await call.audience()
    call.buildPayload()

    expect(mockOrganizerAudience).toHaveBeenCalledWith('org-1', 'e1')
    expect(mockBuildRegistrationPatchPayload).toHaveBeenCalledWith('e1', patch)
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
    const call = mockBroadcast.mock.calls[0]?.[0] as
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

    const call = mockBroadcast.mock.calls[0]?.[0] as
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

  it('publishPublicConnectionCount builds public scoped payload from public audience size', async () => {
    mockPublicAudience.mockResolvedValueOnce([{ connectionId: 'c1' }, { connectionId: 'c2' }])

    await publishPublicConnectionCount()

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    const call = mockBroadcast.mock.calls[0]?.[0] as
      | { audience: () => Promise<unknown[]>; buildPayload: (audience: unknown[]) => unknown }
      | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    const audience = await call.audience()
    call.buildPayload(audience)

    expect(mockBuildConnectionCountPayload).toHaveBeenCalledWith('public:connection-count', 2)
  })

  it('publishPublicConnectionCount excludes specified connection ids from public audience', async () => {
    mockPublicAudience.mockResolvedValueOnce([{ connectionId: 'c1' }, { connectionId: 'c2' }, { connectionId: 'c3' }])

    await publishPublicConnectionCount(['c2'])

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    const call = mockBroadcast.mock.calls[0]?.[0] as
      | { audience: () => Promise<Array<{ connectionId: string }>>; buildPayload: (audience: unknown[]) => unknown }
      | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    const audience = await call.audience()
    expect(audience).toEqual([{ connectionId: 'c1' }, { connectionId: 'c3' }])

    call.buildPayload(audience)
    expect(mockBuildConnectionCountPayload).toHaveBeenCalledWith('public:connection-count', 2)
  })

  it('publishAdminConnectionCount builds admin scoped payload from admin audience size', async () => {
    mockAdminAudience.mockResolvedValueOnce([{ connectionId: 'a1' }, { connectionId: 'a2' }])

    await publishAdminConnectionCount()

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    const call = mockBroadcast.mock.calls[0]?.[0] as
      | { audience: () => Promise<unknown[]>; buildPayload: (audience: unknown[]) => unknown }
      | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    const audience = await call.audience()
    call.buildPayload(audience)

    expect(mockBuildConnectionCountPayload).toHaveBeenCalledWith('admin:connection-count', 2)
  })

  it('publishAdminConnectionCount excludes specified connection ids from admin audience', async () => {
    mockAdminAudience.mockResolvedValueOnce([{ connectionId: 'a1' }, { connectionId: 'a2' }, { connectionId: 'a3' }])

    await publishAdminConnectionCount(['a2'])

    const call = mockBroadcast.mock.calls[0]?.[0] as
      | { audience: () => Promise<Array<{ connectionId: string }>>; buildPayload: (audience: unknown[]) => unknown }
      | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    const audience = await call.audience()
    expect(audience).toEqual([{ connectionId: 'a1' }, { connectionId: 'a3' }])

    call.buildPayload(audience)
    expect(mockBuildConnectionCountPayload).toHaveBeenCalledWith('admin:connection-count', 2)
  })

  it('publishConnectionCounts publishes public and admin counts', async () => {
    await publishConnectionCounts(['c1'])

    expect(mockBroadcast).toHaveBeenCalledTimes(2)
  })

  it('subscribeWebSocketToEvent delegates to subscriptionService with publishEventViewers callback', async () => {
    const connection = { connectionId: 'c1', userName: 'u1' }

    await subscribeWebSocketToEvent(connection as any, 'e1')

    expect(mockSubscribeToEvent).toHaveBeenCalledWith(connection, 'e1', publishEventViewers)
  })

  it('unsubscribeWebSocketFromEvent delegates to subscriptionService with publishEventViewers callback', async () => {
    const connection = { connectionId: 'c1', eventId: 'e1' }

    await unsubscribeWebSocketFromEvent(connection as any)

    expect(mockUnsubscribeFromEvent).toHaveBeenCalledWith(connection, publishEventViewers)
  })

  it('subscribeWebSocketToAdmin delegates to subscriptionService', async () => {
    const connection = { admin: true, connectionId: 'c1' }

    await subscribeWebSocketToAdmin(connection as any)

    expect(mockSubscribeToAdmin).toHaveBeenCalledWith(connection)
  })

  it('unsubscribeWebSocketFromAdmin delegates to subscriptionService', async () => {
    await unsubscribeWebSocketFromAdmin('c1')

    expect(mockUnsubscribeFromAdmin).toHaveBeenCalledWith('c1')
  })

  it('send uses onGoneConnection handler to disconnect gone connection', async () => {
    await publishPublicConnectionCount()

    const call = mockBroadcast.mock.calls[0]?.[0] as { onGoneConnection: (id: string) => Promise<void> } | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    await call.onGoneConnection('gone-1')

    expect(mockDisconnectWebSocket).toHaveBeenCalledWith('gone-1')
  })
})
