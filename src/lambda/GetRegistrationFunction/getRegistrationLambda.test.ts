import type { JsonRegistration, JsonTransaction, PaymentStatus, PaymentTime, Registration } from '../../types'
import { jest } from '@jest/globals'
import { addDays } from 'date-fns'
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

const mockGetRegistration = jest.fn(
  (): Registration => ({
    ...registrationsToEventWithParticipantsInvited[0],
    paymentStatus: 'SUCCESS',
  })
)

import * as libRegistration from '../lib/registration'
import * as libRegistrationAccess from '../lib/registrationAccess'

const mockAuthorizeRegistrationRead = jest.fn(() => 'test-edit-token')

jest.unstable_mockModule('../lib/registrationAccess', () => ({
  ...libRegistrationAccess,
  authorizeRegistrationRead: mockAuthorizeRegistrationRead,
}))

jest.unstable_mockModule('../lib/registration', () => ({
  ...libRegistration,
  getRegistration: mockGetRegistration,
}))

const mockGetEvent = jest.fn(() => mockEventWithInvitationAttachment)

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

const mockGetTransactionsByReference = jest.fn(() => [] as JsonTransaction[])

jest.unstable_mockModule('../lib/payment', () => ({
  getTransactionsByReference: mockGetTransactionsByReference,
}))

const { default: getRegistrationLambda } = await import('./handler')

describe('getRegistration', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

  beforeAll(() => {
    jest.useFakeTimers()
  })
  beforeEach(() => {
    jest.setSystemTime(new Date(mockEventWithInvitationAttachment.startDate))
  })
  afterEach(() => {
    jest.clearAllMocks()
  })
  afterAll(() => {
    jest.useRealTimers()
  })

  it.each([
    [undefined, undefined],
    ['123', undefined],
    [undefined, '123'],
  ])('should return 404 if eventId is %p and id is %p', async (eventId, id) => {
    const res = await getRegistrationLambda(constructAPIGwEvent('test', { pathParameters: { eventId, id } }))

    expect(res.statusCode).toEqual(404)
    expect(errorSpy).toHaveBeenCalledTimes(1)
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
    jest.setSystemTime(addDays(new Date(mockEventWithInvitationAttachment.endDate), 1))

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
    expect(mockGetTransactionsByReference).toHaveBeenCalledWith('123:456')
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
})
