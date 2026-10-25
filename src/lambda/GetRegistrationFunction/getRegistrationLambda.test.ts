import type {
  DogEvent,
  JsonPaymentTransaction,
  JsonRegistration,
  JsonTransaction,
  PaymentStatus,
  PaymentTime,
  Registration,
} from '../../types'
import { vi } from 'vitest'
import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { registrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import { dayEndOf, dayStartOf, TIME_ZONE } from '../../lib/day'
import { PAYMENT_DAYS_AFTER_TRIAL } from '../../lib/event'
import { isParticipantGroup } from '../../lib/registration'
import { LambdaError } from '../lib/lambda'
import { constructAPIGwEvent, deletedEvent, eventNotFound } from '../test-utils/helpers'

const mockEventWithInvitationAttachment = {
  ...eventWithParticipantsInvited,
  invitationAttachment: 'test.pdf',
  invitationAttachmentHistory: {
    'alo.pdf': { className: 'ALO', uploadedAt: '2026-07-28T10:00:00.000Z' },
    'test.pdf': { uploadedAt: '2026-07-27T09:00:00.000Z' },
  },
  invitationAttachments: { ALO: 'alo.pdf' },
}

const mockGetRegistration = vi.fn(
  (): Registration => ({
    ...registrationsToEventWithParticipantsInvited[0],
    paymentStatus: 'SUCCESS',
  })
)

import * as libRegistration from '../lib/registration'

const mockAuthorizeRegistrationRead = vi.fn(() => 'test-edit-token')

vi.doMock('../lib/registration', () => ({
  ...libRegistration,
  authorizeRegistrationRead: mockAuthorizeRegistrationRead,
  getRegistration: mockGetRegistration,
}))

/** The trial in any state, a cancelled one too (KOE-1526). */
type MockEvent = Omit<typeof mockEventWithInvitationAttachment, 'state'> & Pick<DogEvent, 'state'>

const mockGetEvent = vi.fn()
const mockGetLiveEvent = vi.fn((): MockEvent => mockEventWithInvitationAttachment)

vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
  getLiveEvent: mockGetLiveEvent,
}))

/** A payment transaction of the fixture registration, as the transaction table stores it. */
const paymentTransaction = (overrides: Partial<JsonPaymentTransaction> = {}): JsonPaymentTransaction => ({
  amount: 5000,
  createdAt: new Date().toISOString(),
  reference: 'testInvited:testInvited1',
  stamp: 'stamp-1',
  status: 'new',
  transactionId: 'transaction-1',
  type: 'payment',
  ...overrides,
})

const mockReadPaymentTransactions = vi.fn((): JsonTransaction[] => [])

// The open payment ids tell a payment in progress from one left at Paytrail
// (loadOpenPayments reads them from the transaction repository, KOE-1526, KOE-1529, KOE-1530).
vi.doMock('../lib/repositories/transactionRepository', () => ({
  readPaymentTransactions: mockReadPaymentTransactions,
}))

const { default: getRegistrationLambda } = await import('./handler')

describe('getRegistration', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  beforeAll(() => {
    vi.useFakeTimers()
  })
  beforeEach(() => {
    vi.setSystemTime(new Date(mockEventWithInvitationAttachment.startDate))
  })
  afterEach(() => {
    vi.clearAllMocks()
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it.each([
    [undefined, undefined],
    ['123', undefined],
    [undefined, '123'],
  ])('should return 404 if eventId is %p and id is %p', async (eventId, id) => {
    const res = await getRegistrationLambda(constructAPIGwEvent('test', { pathParameters: { eventId, id } }))

    expect(res.statusCode).toEqual(404)
    // A rejected request is the request's fault and logs at info, not as an error of ours (KOE-1342).
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('should add invitationAttachment', async () => {
    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.invitationAttachment).toEqual('alo.pdf')
    expect(reg.invitationAttachmentUpdatedAt).toEqual('2026-07-28T10:00:00.000Z')
    expect(reg.payment?.canPay).toBeFalsy()
  })

  it('leaves the result, the notes and the groups out after deriving from them (KOE-1515)', async () => {
    const stored = registrationsToEventWithParticipantsInvited[0]
    mockGetRegistration.mockImplementationOnce(() => ({
      ...stored,
      eventResult: { result: 'ALO1', updatedAt: new Date('2026-08-01T12:00:00.000Z'), updatedBy: 'Secretary' },
      internalNotes: 'call the owner',
      paymentStatus: 'SUCCESS',
      startGroup: stored.group,
    }))

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg).not.toHaveProperty('eventResult')
    expect(reg).not.toHaveProperty('internalNotes')
    expect(reg).not.toHaveProperty('group')
    expect(reg).not.toHaveProperty('startGroup')
    // The invitation is still derived from the group the response leaves out.
    expect(reg.invitationAttachment).toEqual('alo.pdf')
  })

  it('does not disclose a registration when edit-token authorization fails', async () => {
    mockAuthorizeRegistrationRead.mockImplementationOnce(() => {
      throw new LambdaError(404, 'not found')
    })

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toBe(404)
    expect(mockGetLiveEvent).not.toHaveBeenCalled()
  })

  // KOE-1586: the registration page of a deleted event still opened.
  it('answers a deleted event as a missing one, without disclosing the registration', async () => {
    mockGetEvent.mockReturnValueOnce(deletedEvent(mockEventWithInvitationAttachment))
    mockGetLiveEvent.mockRejectedValueOnce(eventNotFound('123'))

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toBe(404)
    expect(res.body).not.toContain(mockEventWithInvitationAttachment.name)
    expect(mockGetLiveEvent).toHaveBeenCalledWith('123')
    expect(mockReadPaymentTransactions).not.toHaveBeenCalled()
  })

  // KOE-1589: the entry is served for paying through the 7th day after the trial's last day.
  it('serves the registration on the last day a payment may be started', async () => {
    const lastPayingDay = dayStartOf(
      new Date(mockEventWithInvitationAttachment.endDate),
      TIME_ZONE,
      PAYMENT_DAYS_AFTER_TRIAL
    )
    vi.setSystemTime(dayEndOf(lastPayingDay, TIME_ZONE))

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toBe(200)
  })

  // KOE-1589: the koekutsu is for a trial still to come, though a class can stay 'invited' after its day.
  it.each([
    ['serves the invitation attachment on the last day of the trial', 0, 'alo.pdf'],
    ['leaves the invitation attachment out in the week after the trial', 3, undefined],
  ])('%s', async (_when, daysAfter, attachment) => {
    vi.setSystemTime(dayStartOf(new Date(mockEventWithInvitationAttachment.endDate), TIME_ZONE, daysAfter))

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toBe(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.invitationAttachment).toEqual(attachment)
    expect(reg.invitationAttachmentUpdatedAt).toEqual(attachment && '2026-07-28T10:00:00.000Z')
  })

  it('does not disclose registrations once the payment window has closed', async () => {
    vi.setSystemTime(
      dayStartOf(new Date(mockEventWithInvitationAttachment.endDate), TIME_ZONE, PAYMENT_DAYS_AFTER_TRIAL + 1)
    )

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toBe(404)
    expect(mockReadPaymentTransactions).not.toHaveBeenCalled()
  })

  it('falls back to event invitationAttachment when class attachment is missing', async () => {
    mockGetRegistration.mockReturnValueOnce({
      ...registrationsToEventWithParticipantsInvited[2],
      paymentStatus: 'SUCCESS',
    })

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.invitationAttachment).toEqual('test.pdf')
    expect(reg.invitationAttachmentUpdatedAt).toEqual('2026-07-27T09:00:00.000Z')
  })

  it('uses the sent invitation attachment for participant-facing downloads', async () => {
    mockGetRegistration.mockReturnValueOnce({
      ...registrationsToEventWithParticipantsInvited[0],
      invitationAttachmentSent: 'test.pdf',
      messagesSent: { invitation: true },
      paymentStatus: 'SUCCESS',
    })

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.invitationAttachment).toEqual('test.pdf')
  })

  it('should not add invitationAttachment when registration is not in participant group', async () => {
    mockGetRegistration.mockReturnValueOnce({
      ...registrationsToEventWithParticipantsInvited[0],
      group: undefined,
    })

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.invitationAttachment).toBeUndefined()
  })

  it('does not add invitationAttachment for a cancelled registration left in a participant group (KOE-1537)', async () => {
    const stored = registrationsToEventWithParticipantsInvited[0]
    // The bad state: cancelled, but the group key still names a participant group.
    expect(isParticipantGroup(stored.group?.key)).toBe(true)
    mockGetRegistration.mockReturnValueOnce({ ...stored, cancelled: true })

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.invitationAttachment).toBeUndefined()
    expect(reg.invitationAttachmentUpdatedAt).toBeUndefined()
  })

  /**
   * In the canPay tables below, 'PENDING' is a sentinel for "a payment is in progress": it is
   * expressed as `openPayments`, never as the stored `paymentStatus` any more (KOE-1529).
   */
  const withPaymentStatus = (paymentStatus: PaymentStatus | undefined) =>
    paymentStatus === 'PENDING' ? { openPayments: ['transaction-1'] } : { paymentStatus }

  const inProgressWhenPending = (paymentStatus: PaymentStatus | undefined) => {
    if (paymentStatus === 'PENDING') {
      mockReadPaymentTransactions.mockReturnValueOnce([paymentTransaction({ status: 'pending' })])
    }
  }

  // KOE-1526 review: a payment Paytrail is no longer working on is not in progress either.
  it('reads a stale open payment as not in progress, payable', async () => {
    mockGetRegistration.mockReturnValueOnce({
      ...registrationsToEventWithParticipantsInvited[0],
      openPayments: ['transaction-1'],
    })
    mockReadPaymentTransactions.mockReturnValueOnce([
      paymentTransaction({ createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), status: 'pending' }),
    ])

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '456' } })
    )

    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.payment?.status).toBe('unpaid')
    expect(reg.payment?.canPay).toBe(true)
  })

  // KOE-1529: a legacy stored PENDING is left exactly as it was -- nothing rewrites it any more --
  // and with no open payment it does not hold the pay offer back either.
  it('leaves a legacy stored PENDING as it is, and pays no attention to it', async () => {
    mockGetRegistration.mockReturnValueOnce({
      ...registrationsToEventWithParticipantsInvited[0],
      paymentStatus: 'PENDING',
    })

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '456' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.paymentStatus).toEqual('PENDING')
    expect(reg.payment?.status).toBe('unpaid')
    expect(reg.payment?.canPay).toBe(true)
    expect(mockReadPaymentTransactions).not.toHaveBeenCalled()
  })

  it('reads a payment in progress from a fresh open payment, never sending its id', async () => {
    mockGetRegistration.mockReturnValueOnce({
      ...registrationsToEventWithParticipantsInvited[0],
      openPayments: ['transaction-1'],
    })
    mockReadPaymentTransactions.mockReturnValueOnce([paymentTransaction({ status: 'pending' })])

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '456' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    // A reload mid-payment must not offer the pay button again (KOE-1530).
    expect(reg.payment?.status).toBe('inProgress')
    expect(reg.payment?.canPay).toBe(false)
    expect(reg).not.toHaveProperty('openPayments')
    expect(mockReadPaymentTransactions).toHaveBeenCalledWith(['transaction-1'])
  })

  it.each<[boolean, PaymentTime | undefined, PaymentStatus | undefined]>([
    [true, 'confirmation', undefined],
    [false, 'confirmation', 'PENDING'],
    [false, 'confirmation', 'SUCCESS'],
    [true, 'confirmation', 'CANCEL'],
    [true, 'registration', undefined],
    [false, 'registration', 'PENDING'],
    [false, 'registration', 'SUCCESS'],
    [true, 'registration', 'CANCEL'],
  ])(
    'should set canPay: %p when paymentTime is %p and paymentStatus is %p',
    async (expected, paymentTime, paymentStatus) => {
      mockGetLiveEvent.mockReturnValueOnce({ ...mockEventWithInvitationAttachment, paymentTime })
      inProgressWhenPending(paymentStatus)
      mockGetRegistration.mockReturnValueOnce({
        ...registrationsToEventWithParticipantsInvited[0],
        ...withPaymentStatus(paymentStatus),
      })

      const res = await getRegistrationLambda(
        constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
      )

      expect(res.statusCode).toEqual(200)
      const reg: JsonRegistration = JSON.parse(res.body)
      expect(reg.payment?.canPay).toBe(expected)
    }
  )

  it.each<[boolean, PaymentTime | undefined, PaymentStatus | undefined]>([
    [false, 'confirmation', undefined],
    [false, 'confirmation', 'PENDING'],
    [false, 'confirmation', 'SUCCESS'],
    [false, 'confirmation', 'CANCEL'],
    [true, 'registration', undefined],
    [false, 'registration', 'PENDING'],
    [false, 'registration', 'SUCCESS'],
    [true, 'registration', 'CANCEL'],
  ])(
    'should set canPay: %p when paymentTime is %p and paymentStatus is %p and not picked',
    async (expected, paymentTime, paymentStatus) => {
      mockGetLiveEvent.mockReturnValueOnce({ ...mockEventWithInvitationAttachment, paymentTime })
      inProgressWhenPending(paymentStatus)
      mockGetRegistration.mockReturnValueOnce({
        ...registrationsToEventWithParticipantsInvited[0],
        group: undefined,
        ...withPaymentStatus(paymentStatus),
      })

      const res = await getRegistrationLambda(
        constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
      )

      expect(res.statusCode).toEqual(200)
      const reg: JsonRegistration = JSON.parse(res.body)
      expect(reg.payment?.canPay).toBe(expected)
    }
  )

  // A place paid at the member price by someone who was not a member owes the difference once the
  // secretary takes the tick off (KOE-722); the payment link then collects it.
  it.each<[boolean, number]>([
    [true, 123],
    [false, 130],
  ])(
    'should set canPay: %p for a paid registration when the fee is 130 and %p was paid',
    async (expected, paidAmount) => {
      mockGetLiveEvent.mockReturnValueOnce({ ...mockEventWithInvitationAttachment, cost: 130, costMember: 130 })
      mockGetRegistration.mockReturnValueOnce({
        ...registrationsToEventWithParticipantsInvited[0],
        paidAmount,
        paymentStatus: 'SUCCESS',
      })

      const res = await getRegistrationLambda(
        constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
      )

      expect(res.statusCode).toEqual(200)
      const reg: JsonRegistration = JSON.parse(res.body)
      expect(reg.payment?.canPay).toBe(expected)
    }
  )

  // KOE-1526 review: a trial that is not confirmed, a cancelled one say, asks nothing of anyone.
  it('asks nothing to be paid for a trial that has been cancelled', async () => {
    mockGetLiveEvent.mockReturnValueOnce({
      ...mockEventWithInvitationAttachment,
      paymentTime: 'registration',
      state: 'cancelled',
    })
    mockGetRegistration.mockReturnValueOnce({
      ...registrationsToEventWithParticipantsInvited[0],
      paidAmount: undefined,
      paidAt: undefined,
      paymentStatus: undefined,
    })

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.payment?.due).toBe(0)
    expect(reg.payment?.canPay).toBe(false)
  })

  // The prod row of KOE-1526: a reserve that had its whole fee back. The participant gets no group,
  // so what is owed goes with the response.
  it.each<[string, { key: string; number: number }, number, boolean]>([
    ['owes nothing while it is a reserve', { key: 'reserve', number: 1 }, 0, false],
    ['owes the fee again once lifted into a place', { key: '2026-08-15-ap', number: 1 }, 130, true],
  ])('a reserve whose fee was refunded %s (KOE-1526)', async (_name, group, paymentDue, canPay) => {
    mockGetLiveEvent.mockReturnValueOnce({
      ...mockEventWithInvitationAttachment,
      cost: 130,
      costMember: 130,
      paymentTime: 'registration',
    })
    mockGetRegistration.mockReturnValueOnce({
      ...registrationsToEventWithParticipantsInvited[0],
      group,
      paidAmount: 130,
      paymentStatus: 'SUCCESS',
      refundAmount: 130,
      refundHandlingCost: 0,
    })

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.payment?.due).toBe(paymentDue)
    expect(reg.payment?.canPay).toBe(canPay)
    expect(reg.group).toBeUndefined()
  })
})
