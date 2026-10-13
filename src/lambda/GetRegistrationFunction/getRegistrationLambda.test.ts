import type { DogEvent, JsonRegistration, JsonTransaction, PaymentStatus, PaymentTime, Registration } from '../../types'
import { addDays } from 'date-fns'
import { vi } from 'vitest'
import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { registrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import { LambdaError } from '../lib/lambda'
import { constructAPIGwEvent } from '../test-utils/helpers'

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

const mockGetEvent = vi.fn((): MockEvent => mockEventWithInvitationAttachment)

vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

const mockGetTransactionsByReference = vi.fn(() => [] as JsonTransaction[])

// The registration's transactions, which tell a payment in progress from one left at Paytrail
// (getParticipantRow reads them through the client, KOE-1526).
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { query: mockGetTransactionsByReference }
  }),
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
    expect(reg.shouldPay).toBeFalsy()
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
    expect(mockGetEvent).not.toHaveBeenCalled()
  })

  it('does not disclose registrations after the event has ended', async () => {
    vi.setSystemTime(addDays(new Date(mockEventWithInvitationAttachment.endDate), 1))

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toBe(404)
    expect(mockGetTransactionsByReference).not.toHaveBeenCalled()
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

  /** A stored PENDING in these cases is a payment Paytrail is still working on (KOE-1526). */
  const inProgressWhenPending = (paymentStatus: PaymentStatus | undefined) => {
    if (paymentStatus === 'PENDING') {
      mockGetTransactionsByReference.mockReturnValueOnce([
        { createdAt: new Date().toISOString(), status: 'pending', type: 'payment' } as JsonTransaction,
      ])
    }
  }

  // KOE-1526 review: a payment Paytrail is no longer working on is not in progress either.
  it('should read a stored PENDING whose payment went stale as NEW', async () => {
    mockGetRegistration.mockReturnValueOnce({
      ...registrationsToEventWithParticipantsInvited[0],
      paymentStatus: 'PENDING',
    })
    mockGetTransactionsByReference.mockReturnValueOnce([
      {
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        status: 'pending',
        type: 'payment',
      } as JsonTransaction,
    ])

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '456' } })
    )

    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.paymentStatus).toEqual('NEW')
    expect(reg.shouldPay).toBe(true)
  })

  it('should update paymentStatus from PENDING to NEW when there is a new transaction', async () => {
    mockGetRegistration.mockReturnValueOnce({
      ...registrationsToEventWithParticipantsInvited[0],
      paymentStatus: 'PENDING',
    })
    mockGetTransactionsByReference.mockReturnValueOnce([{ status: 'new' } as JsonTransaction])

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '456' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.paymentStatus).toEqual('NEW')
    expect(reg.shouldPay).toBe(true)
    expect(mockGetTransactionsByReference).toHaveBeenCalledWith(
      expect.objectContaining({
        values: {
          ':reference': `${registrationsToEventWithParticipantsInvited[0].eventId}:${registrationsToEventWithParticipantsInvited[0].id}`,
        },
      })
    )
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
    'should set shouldPay: %p when paymentTime is %p and paymentStatus is %p',
    async (expected, paymentTime, paymentStatus) => {
      mockGetEvent.mockReturnValueOnce({ ...mockEventWithInvitationAttachment, paymentTime })
      inProgressWhenPending(paymentStatus)
      mockGetRegistration.mockReturnValueOnce({
        ...registrationsToEventWithParticipantsInvited[0],
        paymentStatus,
      })

      const res = await getRegistrationLambda(
        constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
      )

      expect(res.statusCode).toEqual(200)
      const reg: JsonRegistration = JSON.parse(res.body)
      expect(reg.shouldPay).toBe(expected)
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
    'should set shouldPay: %p when paymentTime is %p and paymentStatus is %p and not picked',
    async (expected, paymentTime, paymentStatus) => {
      mockGetEvent.mockReturnValueOnce({ ...mockEventWithInvitationAttachment, paymentTime })
      inProgressWhenPending(paymentStatus)
      mockGetRegistration.mockReturnValueOnce({
        ...registrationsToEventWithParticipantsInvited[0],
        group: undefined,
        paymentStatus,
      })

      const res = await getRegistrationLambda(
        constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
      )

      expect(res.statusCode).toEqual(200)
      const reg: JsonRegistration = JSON.parse(res.body)
      expect(reg.shouldPay).toBe(expected)
    }
  )

  // A place paid at the member price by someone who was not a member owes the difference once the
  // secretary takes the tick off (KOE-722); the payment link then collects it.
  it.each<[boolean, number]>([
    [true, 123],
    [false, 130],
  ])(
    'should set shouldPay: %p for a paid registration when the fee is 130 and %p was paid',
    async (expected, paidAmount) => {
      mockGetEvent.mockReturnValueOnce({ ...mockEventWithInvitationAttachment, cost: 130, costMember: 130 })
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
      expect(reg.shouldPay).toBe(expected)
    }
  )

  // KOE-1526 review: a trial that is not confirmed, a cancelled one say, asks nothing of anyone.
  it('asks nothing to be paid for a trial that has been cancelled', async () => {
    mockGetEvent.mockReturnValueOnce({
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
    expect(reg.paymentDue).toBe(0)
    expect(reg.shouldPay).toBe(false)
  })

  // The prod row of KOE-1526: a reserve that had its whole fee back. The participant gets no group,
  // so what is owed goes with the response.
  it.each<[string, { key: string; number: number }, number, boolean]>([
    ['owes nothing while it is a reserve', { key: 'reserve', number: 1 }, 0, false],
    ['owes the fee again once lifted into a place', { key: '2026-08-15-ap', number: 1 }, 130, true],
  ])('a reserve whose fee was refunded %s (KOE-1526)', async (_name, group, paymentDue, shouldPay) => {
    mockGetEvent.mockReturnValueOnce({
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
    expect(reg.paymentDue).toBe(paymentDue)
    expect(reg.shouldPay).toBe(shouldPay)
    expect(reg.group).toBeUndefined()
  })
})
