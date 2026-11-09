import { vi } from 'vitest'
import { LambdaError } from '../../lib/lambda'
import { deletedEvent, eventNotFound } from '../../test-utils/helpers'
import { loggedLines } from '../../test-utils/logs'

const mockGetEvent = vi.fn()
const mockGetLiveEvent = vi.fn()
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
const mockReadPaymentTransactions = vi.fn()

// The open payment ids tell a payment in progress from one left at Paytrail (KOE-1529).
vi.doMock('../repositories/transactionRepository', () => ({
  readPaymentTransactions: mockReadPaymentTransactions,
}))

vi.doMock('../../lib/event', () => ({
  getEvent: mockGetEvent,
  getLiveEvent: mockGetLiveEvent,
}))

vi.doMock('../../lib/registration', () => ({
  getRegistration: mockGetRegistration,
  verifyRegistrationEditToken: mockVerifyRegistrationEditToken,
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

/** A connection whose token expired a minute ago. */
const expired = () => Math.floor(Date.now() / 1000) - 60

/** The connection a signed-in user without admin or club roles authenticates to (KOE-1735). */
const roleless = { admin: false, connectionId: 'c1', userId: 'user-1' }

describe('ws/subscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    await expect(subscribeToAdmin({ admin: true, connectionId: 'c1', expiresAt: expired() })).rejects.toEqual(
      new LambdaError(401, 'Connection expired')
    )
    expect(mockSubscribeAdminChannel).not.toHaveBeenCalled()
  })

  it.each([
    ['an unauthenticated connection', { connectionId: 'c1' }],
    ['a signed-in user without any role', roleless],
  ])('subscribeToAdmin refuses %s with 403', async (_, connection) => {
    await expect(subscribeToAdmin(connection)).rejects.toEqual(new LambdaError(403, 'Forbidden'))
    expect(mockSubscribeAdminChannel).not.toHaveBeenCalled()
  })

  it.each([
    ['an admin', { admin: true, connectionId: 'c1' }],
    ['a club member', { admin: false, connectionId: 'c1', memberOf: ['org-1'] }],
  ])('subscribeToAdmin sets adminSubscribed for %s', async (_, connection) => {
    const result = await subscribeToAdmin(connection)
    expect(mockSubscribeAdminChannel).toHaveBeenCalledWith('c1')
    expect(mockSubscribeConnection).not.toHaveBeenCalled()
    expect(result).toEqual({ adminSubscribed: true })
  })

  it('subscribeToEvent throws 401 when connection is expired', async () => {
    await expect(
      subscribeToEvent({ admin: true, connectionId: 'c1', expiresAt: expired() }, 'e1', vi.fn())
    ).rejects.toEqual(new LambdaError(401, 'Connection expired'))
  })

  it('subscribeToEvent throws 403 for non-admin users outside organizer', async () => {
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-1' } })

    await expect(
      subscribeToEvent({ admin: false, connectionId: 'c1', memberOf: ['org-2'] }, 'e1', vi.fn())
    ).rejects.toEqual(new LambdaError(403, 'Forbidden'))
  })

  it('subscribeToEvent refuses a signed-in user without any role, before anything is stored', async () => {
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-1' } })
    const publishEventViewers = vi.fn()

    await expect(subscribeToEvent(roleless, 'e1', publishEventViewers)).rejects.toEqual(
      new LambdaError(403, 'Forbidden')
    )
    expect(mockSubscribeConnection).not.toHaveBeenCalled()
    expect(publishEventViewers).not.toHaveBeenCalled()
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

  describe('a viewer push after the stored subscription (KOE-1583)', () => {
    it('subscribeToEvent answers subscribed when the previous event cannot be read', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-new' } }).mockRejectedValueOnce(new Error('gone'))
      const publishEventViewers = vi.fn().mockResolvedValue(undefined)

      await expect(
        subscribeToEvent({ admin: true, connectionId: 'c1', eventId: 'e-old' }, 'e-new', publishEventViewers)
      ).resolves.toEqual({ eventId: 'e-new', subscribed: true })

      expect(mockSubscribeConnection).toHaveBeenCalledWith('c1', 'e-new')
      expect(publishEventViewers).toHaveBeenCalledTimes(1)
      expect(publishEventViewers).toHaveBeenCalledWith('e-new', 'org-new', expect.any(Object))
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({ message: 'live push failed', publication: 'event viewers' }),
      ])
    })

    it('unsubscribeFromEvent resolves when the event cannot be read', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mockGetEvent.mockRejectedValueOnce(new Error('gone'))
      const publishEventViewers = vi.fn().mockResolvedValue(undefined)

      await expect(unsubscribeFromEvent({ connectionId: 'c1', eventId: 'e1' }, publishEventViewers)).resolves.toBe(
        undefined
      )

      expect(mockUnsubscribeConnection).toHaveBeenCalledWith('c1')
      expect(publishEventViewers).not.toHaveBeenCalled()
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({ message: 'live push failed', publication: 'event viewers' }),
      ])
    })
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
    mockGetLiveEvent.mockResolvedValueOnce({ cost: 50, entryStartDate: '2026-07-01', id: 'e1', state: 'confirmed' })
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
          payment: expect.objectContaining({ canPay: false, due: 0, status: 'refunded' }),
          paymentStatus: 'SUCCESS',
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
    mockGetLiveEvent.mockResolvedValueOnce({
      cost: 50,
      entryStartDate: '2026-07-01',
      id: 'e1',
      paymentTime: 'registration',
      state: 'confirmed',
    })
    mockGetRegistration.mockResolvedValueOnce(registration).mockResolvedValueOnce(registration)

    await expect(subscribeToRegistration({ connectionId: 'c1' }, 'e1', 'r1', 'edit-token')).resolves.toEqual(
      expect.objectContaining({
        patch: expect.objectContaining({
          payment: expect.objectContaining({ canPay: true, due: 50 }),
          refundAmount: 50,
        }),
      })
    )
  })

  // KOE-1529: an entrant who reached Paytrail and closed the tab leaves an open payment that is
  // still `new` at Paytrail. That payment is not in progress, and the answer says what
  // GetRegistration says: pay. The legacy stored PENDING itself is left exactly as it is.
  it('answers an abandoned payment as one that can be paid, as GetRegistration does', async () => {
    const registration = {
      createdAt: '2026-07-25T10:00:00.000Z',
      dog: { breedCode: '122' },
      editTokenVersion: 1,
      eventId: 'e1',
      group: { key: '2026-08-15-ap', number: 1 },
      id: 'r1',
      openPayments: ['t1'],
      owner: { membership: false },
      ownerHandles: true,
      paymentStatus: 'PENDING',
    }
    mockGetLiveEvent.mockResolvedValueOnce({
      cost: 50,
      entryStartDate: '2026-07-01',
      id: 'e1',
      paymentTime: 'registration',
      state: 'confirmed',
    })
    mockGetRegistration.mockResolvedValueOnce(registration).mockResolvedValueOnce(registration)
    mockReadPaymentTransactions.mockResolvedValueOnce([
      { createdAt: new Date().toISOString(), reference: 'e1:r1', status: 'new', transactionId: 't1', type: 'payment' },
    ])

    await expect(subscribeToRegistration({ connectionId: 'c1' }, 'e1', 'r1', 'edit-token')).resolves.toEqual(
      expect.objectContaining({
        patch: expect.objectContaining({
          payment: expect.objectContaining({ canPay: true, due: 50, status: 'unpaid' }),
        }),
      })
    )
    expect(mockReadPaymentTransactions).toHaveBeenCalledWith(['t1'])
  })

  // KOE-1586: the entrant's page of a deleted event still got its live patches.
  it('refuses a deleted event as a missing one, before the subscription is stored', async () => {
    const registration = { editTokenVersion: 1, eventId: 'e1', id: 'r1' }
    mockGetRegistration.mockResolvedValueOnce(registration)
    mockGetEvent.mockResolvedValueOnce(deletedEvent({ id: 'e1', state: 'cancelled' }))
    mockGetLiveEvent.mockRejectedValueOnce(eventNotFound('e1'))

    await expect(subscribeToRegistration({ connectionId: 'c1' }, 'e1', 'r1', 'edit-token')).rejects.toMatchObject({
      status: 404,
    })
    expect(mockGetLiveEvent).toHaveBeenCalledWith('e1')
    expect(mockSubscribeRegistrationConnection).not.toHaveBeenCalled()
  })

  it('unsubscribes from a registration', async () => {
    await expect(unsubscribeFromRegistration('c1')).resolves.toEqual({ unsubscribed: true })
    expect(mockUnsubscribeRegistrationConnection).toHaveBeenCalledWith('c1')
  })
})
