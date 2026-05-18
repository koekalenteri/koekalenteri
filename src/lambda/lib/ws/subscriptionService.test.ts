import { jest } from '@jest/globals'
import { LambdaError } from '../../lib/lambda'

const mockGetEvent = jest.fn<any>()
const mockIsConnectionExpired = jest.fn<any>()
const mockGetConnection = jest.fn<any>()
const mockSubscribeConnection = jest.fn<any>()
const mockUnsubscribeConnection = jest.fn<any>()

jest.unstable_mockModule('../../lib/event', () => ({
  getEvent: mockGetEvent,
}))

jest.unstable_mockModule('./connectionPolicy', () => ({
  isConnectionExpired: mockIsConnectionExpired,
}))

jest.unstable_mockModule('./connectionRepository', () => ({
  getConnection: mockGetConnection,
  subscribeConnection: mockSubscribeConnection,
  unsubscribeConnection: mockUnsubscribeConnection,
}))

const { subscribeToEvent, unsubscribeFromEvent } = await import('./subscriptionService')

describe('ws/subscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsConnectionExpired.mockReturnValue(false)
  })

  it('subscribeToEvent throws 401 when connection is expired', async () => {
    mockIsConnectionExpired.mockReturnValueOnce(true)

    await expect(subscribeToEvent({ connectionId: 'c1' } as any, 'e1', jest.fn<any>())).rejects.toEqual(
      new LambdaError(401, 'Connection expired')
    )
  })

  it('subscribeToEvent throws 403 for non-admin users outside organizer', async () => {
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-1' } })

    await expect(
      subscribeToEvent({ admin: false, connectionId: 'c1', memberOf: ['org-2'] } as any, 'e1', jest.fn<any>())
    ).rejects.toEqual(new LambdaError(403, 'Forbidden'))
  })

  it('subscribeToEvent subscribes and publishes only current event when no previous event', async () => {
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-1' } })
    const publishEventViewers = jest.fn<any>().mockResolvedValue(undefined)

    const result = await subscribeToEvent({ admin: true, connectionId: 'c1' } as any, 'e1', publishEventViewers)

    expect(mockSubscribeConnection).toHaveBeenCalledWith('c1', 'e1')
    expect(publishEventViewers).toHaveBeenCalledTimes(1)
    expect(publishEventViewers).toHaveBeenCalledWith('e1', 'org-1')
    expect(result).toEqual({ eventId: 'e1', subscribed: true })
  })

  it('subscribeToEvent publishes both previous and current event when switching', async () => {
    mockGetEvent
      .mockResolvedValueOnce({ organizer: { id: 'org-new' } })
      .mockResolvedValueOnce({ organizer: { id: 'org-old' } })
    const publishEventViewers = jest.fn<any>().mockResolvedValue(undefined)

    await subscribeToEvent({ admin: true, connectionId: 'c1', eventId: 'e-old' } as any, 'e-new', publishEventViewers)

    expect(mockSubscribeConnection).toHaveBeenCalledWith('c1', 'e-new')
    expect(publishEventViewers).toHaveBeenNthCalledWith(1, 'e-old', 'org-old')
    expect(publishEventViewers).toHaveBeenNthCalledWith(2, 'e-new', 'org-new')
  })

  it('unsubscribeFromEvent unsubscribes and publishes when connection has event', async () => {
    mockGetConnection.mockResolvedValueOnce({ connectionId: 'c1', eventId: 'e1' })
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-1' } })
    const publishEventViewers = jest.fn<any>().mockResolvedValue(undefined)

    await unsubscribeFromEvent('c1', publishEventViewers)

    expect(mockUnsubscribeConnection).toHaveBeenCalledWith('c1')
    expect(publishEventViewers).toHaveBeenCalledWith('e1', 'org-1')
  })

  it('unsubscribeFromEvent only unsubscribes when connection has no event', async () => {
    mockGetConnection.mockResolvedValueOnce({ connectionId: 'c1' })
    const publishEventViewers = jest.fn<any>().mockResolvedValue(undefined)

    await unsubscribeFromEvent('c1', publishEventViewers)

    expect(mockUnsubscribeConnection).toHaveBeenCalledWith('c1')
    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(publishEventViewers).not.toHaveBeenCalled()
  })
})
