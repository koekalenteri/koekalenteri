import { jest } from '@jest/globals'

const mockBroadcast = jest.fn<any>().mockResolvedValue({ attempted: 0, failed: 0, gone: 0, sent: 0 })
const mockDisconnectWebSocket = jest.fn<any>().mockResolvedValue(undefined)
const mockEventAudience = jest.fn<any>().mockReturnValue([])
const mockOrganizerAudience = jest.fn<any>().mockReturnValue([])
const mockPublicAudience = jest.fn<any>().mockReturnValue([])
const mockBuildConnectionCountPayload = jest.fn((count: number) => ({ count }))
const mockBuildEventPatchPayload = jest.fn((eventId: string, patch: object) => ({ eventId, ...patch }))
const mockBuildEventViewersPayload = jest.fn((eventId: string, viewers: unknown[]) => ({ eventId, viewers }))
const mockBuildRegistrationPatchPayload = jest.fn((eventId: string, patch: unknown[]) => ({ eventId, patch }))
const mockToEventViewers = jest.fn((audience: unknown[]) => audience)
const mockSubscribeToEvent = jest.fn<any>().mockResolvedValue(undefined)
const mockUnsubscribeFromEvent = jest.fn<any>().mockResolvedValue(undefined)

jest.unstable_mockModule('./broadcast', () => ({
  broadcast: mockBroadcast,
}))

jest.unstable_mockModule('./connectionLifecycle', () => ({
  disconnectWebSocket: mockDisconnectWebSocket,
}))

jest.unstable_mockModule('./connectionSelectors', () => ({
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
  subscribeToEvent: mockSubscribeToEvent,
  unsubscribeFromEvent: mockUnsubscribeFromEvent,
}))

const {
  publishPublicEvent,
  publishAdminEventPatch,
  publishEventPatch,
  publishRegistrationPatches,
  publishEventViewers,
  publishConnectionCount,
  subscribeWebSocketToEvent,
  unsubscribeWebSocketFromEvent,
} = await import('./actions')

describe('ws/actions', () => {
  beforeEach(() => {
    mockBroadcast.mockClear()
    mockDisconnectWebSocket.mockClear()
    mockEventAudience.mockClear()
    mockOrganizerAudience.mockClear()
    mockPublicAudience.mockClear()
    mockBuildConnectionCountPayload.mockClear()
    mockBuildEventPatchPayload.mockClear()
    mockBuildEventViewersPayload.mockClear()
    mockBuildRegistrationPatchPayload.mockClear()
    mockToEventViewers.mockClear()
    mockSubscribeToEvent.mockClear()
    mockUnsubscribeFromEvent.mockClear()
  })

  it('publishPublicEvent sends public audience patch payload', async () => {
    await publishPublicEvent({ entries: 5, eventId: 'e1' })

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: mockPublicAudience,
        buildPayload: expect.any(Function),
        onGoneConnection: expect.any(Function),
      })
    )
    expect(mockBuildEventPatchPayload).toHaveBeenCalledWith('e1', { entries: 5, eventId: 'e1' })
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
    expect(mockOrganizerAudience).toHaveBeenCalledWith('org-1')
    expect(mockBuildEventPatchPayload).toHaveBeenCalledWith('e1', { eventId: 'e1', name: 'Updated' })
  })

  it('publishes only admin patch when no public fields changed', async () => {
    await publishEventPatch({ eventId: 'e1', name: 'Updated' }, 'org-1')

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
  })

  it('publishes admin patch and derived public patch when public fields changed', async () => {
    await publishEventPatch({ entries: 10, eventId: 'e1' }, 'org-1')

    expect(mockBroadcast).toHaveBeenCalledTimes(2)
  })

  it('publishRegistrationPatches sends admin:event-registrations payload to event audience', async () => {
    const patch = [{ id: 'r1', state: 'invited' }]

    await publishRegistrationPatches('e1', patch as any, 'org-1')

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    expect(mockEventAudience).toHaveBeenCalledWith('e1', 'org-1')
    expect(mockBuildRegistrationPatchPayload).toHaveBeenCalledWith('e1', patch)
  })

  it('publishEventViewers builds viewers payload from audience', async () => {
    await publishEventViewers('e1', 'org-1')

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    expect(mockEventAudience).toHaveBeenCalledWith('e1', 'org-1')
    expect(mockToEventViewers).toHaveBeenCalled()
    expect(mockBuildEventViewersPayload).toHaveBeenCalledWith('e1', expect.any(Array))
  })

  it('publishConnectionCount builds payload from public audience size', async () => {
    await publishConnectionCount()

    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    expect(mockBuildConnectionCountPayload).toHaveBeenCalledWith(expect.any(Number))
  })

  it('subscribeWebSocketToEvent delegates to subscriptionService with publishEventViewers callback', async () => {
    const connection = { connectionId: 'c1', userName: 'u1' }

    await subscribeWebSocketToEvent(connection as any, 'e1')

    expect(mockSubscribeToEvent).toHaveBeenCalledWith(connection, 'e1', publishEventViewers)
  })

  it('unsubscribeWebSocketFromEvent delegates to subscriptionService with publishEventViewers callback', async () => {
    await unsubscribeWebSocketFromEvent('c1')

    expect(mockUnsubscribeFromEvent).toHaveBeenCalledWith('c1', publishEventViewers)
  })

  it('send uses onGoneConnection handler to disconnect gone connection', async () => {
    await publishConnectionCount()

    const call = mockBroadcast.mock.calls[0]?.[0] as { onGoneConnection: (id: string) => Promise<void> } | undefined
    expect(call).toBeTruthy()
    if (!call) throw new Error('missing broadcast call')

    await call.onGoneConnection('gone-1')

    expect(mockDisconnectWebSocket).toHaveBeenCalledWith('gone-1')
  })
})
