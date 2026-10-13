import { vi } from 'vitest'
import { LambdaError } from '../../lib/lambda'

const mockGetEvent = vi.fn()
const mockIsConnectionExpired = vi.fn()
const mockCanReceiveAnyAdminEvent = vi.fn()
const mockGetConnection = vi.fn()
const mockSubscribeAdminChannel = vi.fn()
const mockSubscribeConnection = vi.fn()
const mockSubscribePublicEventConnection = vi.fn()
const mockSubscribeRegistrationConnection = vi.fn()
const mockUnsubscribeAdminChannel = vi.fn()
const mockUnsubscribeConnection = vi.fn()
const mockUnsubscribePublicEventConnection = vi.fn()
const mockUnsubscribeRegistrationConnection = vi.fn()
const mockGetRegistration = vi.fn()
const mockVerifyRegistrationEditToken = vi.fn()

vi.doMock('../../lib/event', () => ({
  getEvent: mockGetEvent,
}))

vi.doMock('../../lib/registration', () => ({
  getRegistration: mockGetRegistration,
  verifyRegistrationEditToken: mockVerifyRegistrationEditToken,
}))

vi.doMock('./connectionPolicy', () => ({
  canReceiveAnyAdminEvent: mockCanReceiveAnyAdminEvent,
  isConnectionExpired: mockIsConnectionExpired,
}))

vi.doMock('./connectionRepository', () => ({
  getConnection: mockGetConnection,
  subscribeAdminChannel: mockSubscribeAdminChannel,
  subscribeConnection: mockSubscribeConnection,
  subscribePublicEventConnection: mockSubscribePublicEventConnection,
  subscribeRegistrationConnection: mockSubscribeRegistrationConnection,
  unsubscribeAdminChannel: mockUnsubscribeAdminChannel,
  unsubscribeConnection: mockUnsubscribeConnection,
  unsubscribePublicEventConnection: mockUnsubscribePublicEventConnection,
  unsubscribeRegistrationConnection: mockUnsubscribeRegistrationConnection,
}))

const {
  subscribeToAdmin,
  subscribeToEvent,
  subscribeToPublicStartList,
  subscribeToRegistration,
  unsubscribeFromAdmin,
  unsubscribeFromEvent,
  unsubscribeFromPublicStartList,
  unsubscribeFromRegistration,
} = await import('./subscriptionService')

describe('ws/subscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsConnectionExpired.mockReturnValue(false)
    mockCanReceiveAnyAdminEvent.mockReturnValue(true)
  })

  it('subscribeToPublicStartList stores the event without reading or authorizing it', async () => {
    await expect(subscribeToPublicStartList('c1', 'e1')).resolves.toEqual({ eventId: 'e1', subscribed: true })

    expect(mockSubscribePublicEventConnection).toHaveBeenCalledWith('c1', 'e1')
    // Nothing about the reader is checked: the rows are published truth, and the connection must
    // stay in the public audience.
    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(mockSubscribeConnection).not.toHaveBeenCalled()
  })

  it('unsubscribeFromPublicStartList clears the subscription', async () => {
    await expect(unsubscribeFromPublicStartList('c1')).resolves.toEqual({ unsubscribed: true })

    expect(mockUnsubscribePublicEventConnection).toHaveBeenCalledWith('c1')
  })

  it('subscribeToAdmin throws 401 when connection is expired', async () => {
    mockIsConnectionExpired.mockReturnValueOnce(true)
    await expect(subscribeToAdmin({ connectionId: 'c1' })).rejects.toEqual(new LambdaError(401, 'Connection expired'))
  })

  it('subscribeToAdmin throws 403 for non-admin/non-member connection', async () => {
    mockCanReceiveAnyAdminEvent.mockReturnValueOnce(false)
    await expect(subscribeToAdmin({ connectionId: 'c1' })).rejects.toEqual(new LambdaError(403, 'Forbidden'))
  })

  it('subscribeToAdmin sets adminSubscribed', async () => {
    const result = await subscribeToAdmin({ connectionId: 'c1' })
    expect(mockSubscribeAdminChannel).toHaveBeenCalledWith('c1')
    expect(mockSubscribeConnection).not.toHaveBeenCalled()
    expect(result).toEqual({ adminSubscribed: true })
  })

  it('subscribeToEvent throws 401 when connection is expired', async () => {
    mockIsConnectionExpired.mockReturnValueOnce(true)

    await expect(subscribeToEvent({ connectionId: 'c1' }, 'e1', vi.fn())).rejects.toEqual(
      new LambdaError(401, 'Connection expired')
    )
  })

  it('subscribeToEvent throws 403 for non-admin users outside organizer', async () => {
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-1' } })

    await expect(
      subscribeToEvent({ admin: false, connectionId: 'c1', memberOf: ['org-2'] }, 'e1', vi.fn())
    ).rejects.toEqual(new LambdaError(403, 'Forbidden'))
  })

  it('subscribeToEvent subscribes and publishes only current event when no previous event', async () => {
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-1' } })
    const publishEventViewers = vi.fn().mockResolvedValue(undefined)

    const result = await subscribeToEvent({ admin: true, connectionId: 'c1' }, 'e1', publishEventViewers)

    expect(mockSubscribeConnection).toHaveBeenCalledWith('c1', 'e1')
    expect(publishEventViewers).toHaveBeenCalledTimes(1)
    expect(publishEventViewers).toHaveBeenCalledWith('e1', 'org-1', {
      include: { admin: true, connectionId: 'c1', eventId: 'e1' },
    })
    expect(result).toEqual({ eventId: 'e1', subscribed: true })
  })

  it('subscribeToEvent publishes both previous and current event when switching', async () => {
    mockGetEvent
      .mockResolvedValueOnce({ organizer: { id: 'org-new' } })
      .mockResolvedValueOnce({ organizer: { id: 'org-old' } })
    const publishEventViewers = vi.fn().mockResolvedValue(undefined)

    await subscribeToEvent({ admin: true, connectionId: 'c1', eventId: 'e-old' }, 'e-new', publishEventViewers)

    expect(mockSubscribeConnection).toHaveBeenCalledWith('c1', 'e-new')
    expect(publishEventViewers).toHaveBeenNthCalledWith(1, 'e-old', 'org-old')
    expect(publishEventViewers).toHaveBeenNthCalledWith(2, 'e-new', 'org-new', {
      include: {
        admin: true,
        connectionId: 'c1',
        eventId: 'e-new',
      },
    })
  })

  it('unsubscribeFromEvent unsubscribes and publishes when connection has event', async () => {
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-1' } })
    const publishEventViewers = vi.fn().mockResolvedValue(undefined)

    await unsubscribeFromEvent({ connectionId: 'c1', eventId: 'e1' }, publishEventViewers)

    expect(mockGetConnection).not.toHaveBeenCalled()
    expect(mockUnsubscribeConnection).toHaveBeenCalledWith('c1')
    expect(publishEventViewers).toHaveBeenCalledWith('e1', 'org-1', { excludeConnectionId: 'c1' })
  })

  it('unsubscribeFromEvent only unsubscribes when connection has no event', async () => {
    const publishEventViewers = vi.fn().mockResolvedValue(undefined)

    await unsubscribeFromEvent({ connectionId: 'c1' }, publishEventViewers)

    expect(mockGetConnection).not.toHaveBeenCalled()
    expect(mockUnsubscribeConnection).toHaveBeenCalledWith('c1')
    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(publishEventViewers).not.toHaveBeenCalled()
  })

  it('unsubscribeFromAdmin clears admin subscription', async () => {
    const result = await unsubscribeFromAdmin('c1')
    expect(mockUnsubscribeAdminChannel).toHaveBeenCalledWith('c1')
    expect(result).toEqual({ adminSubscribed: false })
  })

  it('subscribes to a registration only after validating its edit token', async () => {
    const registration = {
      createdAt: '2026-07-25T10:00:00.000Z',
      dog: { breedCode: '122' },
      editTokenVersion: 1,
      eventId: 'e1',
      group: { key: 'reserve', number: 1 },
      id: 'r1',
      owner: { membership: false },
      ownerHandles: true,
    }
    mockGetEvent.mockResolvedValueOnce({ cost: 50, entryStartDate: '2026-07-01', id: 'e1' })
    // A reserve whose fee went back: the page has no group, so the patch says it owes nothing (KOE-1526).
    mockGetRegistration.mockResolvedValueOnce(registration).mockResolvedValueOnce({
      ...registration,
      paidAmount: 50,
      paymentStatus: 'SUCCESS',
      refundAmount: 50,
    })

    await expect(subscribeToRegistration({ connectionId: 'c1' }, 'e1', 'r1', 'edit-token')).resolves.toEqual(
      expect.objectContaining({
        eventId: 'e1',
        patch: expect.objectContaining({
          eventId: 'e1',
          id: 'r1',
          paymentDue: 0,
          paymentStatus: 'SUCCESS',
          shouldPay: false,
        }),
        registrationId: 'r1',
        scope: 'participant:registration-patch',
        subscribed: true,
      })
    )
    expect(mockVerifyRegistrationEditToken).toHaveBeenCalledWith(registration, 'edit-token')
    expect(mockSubscribeRegistrationConnection).toHaveBeenCalledWith('c1', 'e1', 'r1')
  })

  // KOE-1526 review: the subscribe answer and GetRegistration must agree on the pay button. A reserve
  // whose fee went back and that was then lifted into a place owes the fee and should pay.
  it('asks a lifted reserve whose fee was refunded to pay, as GetRegistration does', async () => {
    const registration = {
      createdAt: '2026-07-25T10:00:00.000Z',
      dog: { breedCode: '122' },
      editTokenVersion: 1,
      eventId: 'e1',
      group: { key: '2026-08-15-ap', number: 1 },
      id: 'r1',
      owner: { membership: false },
      ownerHandles: true,
      paidAmount: 50,
      paymentStatus: 'SUCCESS',
      refundAmount: 50,
    }
    mockGetEvent.mockResolvedValueOnce({
      cost: 50,
      entryStartDate: '2026-07-01',
      id: 'e1',
      paymentTime: 'registration',
    })
    mockGetRegistration.mockResolvedValueOnce(registration).mockResolvedValueOnce(registration)

    await expect(subscribeToRegistration({ connectionId: 'c1' }, 'e1', 'r1', 'edit-token')).resolves.toEqual(
      expect.objectContaining({
        patch: expect.objectContaining({ paymentDue: 50, refundAmount: 50, shouldPay: true }),
      })
    )
  })

  it('unsubscribes from a registration', async () => {
    await expect(unsubscribeFromRegistration('c1')).resolves.toEqual({ unsubscribed: true })
    expect(mockUnsubscribeRegistrationConnection).toHaveBeenCalledWith('c1')
  })
})
