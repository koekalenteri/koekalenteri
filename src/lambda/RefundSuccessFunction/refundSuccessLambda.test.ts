import type { JsonRegistration } from '../../types'
import type { CancelledRegistration } from '../lib/payment'
import { vi } from 'vitest'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockVerifyParams = vi.fn()
const mockParseParams = vi.fn()
const mockGetRegistration = vi.fn()
const mockGetEvent = vi.fn()
const mockUpdateTransactionStatus = vi.fn()
const mockSettleFailedTransaction = vi.fn()
const mockApplySuccessfulRefund = vi.fn()
const mockClearRegistrationEmailDeliveryStatus = vi.fn()
const mockSendTemplatedMail = vi.fn()
const mockRegistrationEmailTags = vi.fn()
const mockAudit = vi.fn()
const mockRegistrationAuditKey = vi.fn()
const mockReadTransaction = vi.fn()
const mockReadRegistration = vi.fn()
const mockPublishRegistrationPatches = vi.fn().mockResolvedValue({ attempted: 0, failed: 0, gone: 0, sent: 0 })
const mockPublishCancelledRegistration = vi.fn()
const mockPublishParticipantPayments = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  LambdaError: class LambdaError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/payment', () => ({
  parseParams: mockParseParams,
  publishCancelledRegistration: mockPublishCancelledRegistration,
  publishParticipantPayments: mockPublishParticipantPayments,
  settleFailedTransaction: mockSettleFailedTransaction,
  updateTransactionStatus: mockUpdateTransactionStatus,
  verifyParams: mockVerifyParams,
}))

vi.doMock('../lib/registration', () => ({
  getRegistration: mockGetRegistration,
  getRegistrationEditToken: vi.fn(() => 'test-edit-token'),
}))

vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

vi.doMock('../lib/email', () => ({
  registrationEmailTags: mockRegistrationEmailTags,
  registrationEmailTemplateData: vi.fn(() => ({})),
  sendTemplatedMail: mockSendTemplatedMail,
}))

vi.doMock('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

vi.doMock('../lib/repositories/transactionRepository', () => ({
  applySuccessfulRefund: mockApplySuccessfulRefund,
  readTransaction: mockReadTransaction,
}))

vi.doMock('../lib/repositories/registrationRepository', () => ({
  clearRegistrationEmailDeliveryStatus: mockClearRegistrationEmailDeliveryStatus,
  readRegistration: mockReadRegistration,
}))

// The real publisher runs, its guard included (KOE-1583); the connection scan below it is the boundary.
const mockQueryAdminConnections = vi.fn()
vi.doMock('../lib/ws/connectionRepository', () => ({
  queryAdminConnections: mockQueryAdminConnections,
  queryPublicConnections: vi.fn().mockResolvedValue([]),
  removeConnection: vi.fn(),
}))
vi.doMock('../lib/ws/actions', () => ({
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

const { default: refundSuccessLambda } = await import('./handler')
const actualActions = await vi.importActual<typeof import('../lib/ws/actions')>('../lib/ws/actions')

describe('refundSuccessLambda', () => {
  let errorSpy = vi.spyOn(console, 'error')

  const event = constructPartialAPIGwEvent({
    queryStringParameters: {
      'checkout-amount': '1000',
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'ok',
      'checkout-transaction-id': 'transaction123',
      signature: 'valid-signature',
    },
  })

  const mockTransaction = {
    amount: 1000,
    createdAt: '2023-01-01T12:00:00.000Z',
    handlingCost: 500,
    reference: 'event123:reg456',
    status: 'pending',
    transactionId: 'transaction123',
    type: 'refund',
    user: 'Test User',
  }

  const mockRegistration = {
    eventId: 'event123',
    id: 'reg456',
    language: 'fi',
    paidAmount: 20,
    payer: {
      email: 'payer@example.com',
    },
  }

  const mockConfirmedEvent = {
    id: 'event123',
    name: 'Test Event',
    organizer: { id: 'org-1' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryAdminConnections.mockResolvedValue([])
    mockPublishRegistrationPatches.mockImplementation(actualActions.publishRegistrationPatches)

    vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Default mock implementations
    mockVerifyParams.mockResolvedValue(undefined)

    mockParseParams.mockReturnValue({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'ok',
      transactionId: 'transaction123',
    })

    mockReadTransaction.mockResolvedValue(mockTransaction)
    // The registration is read again, strongly consistent, after applying (KOE-1529).
    mockReadRegistration.mockResolvedValue({ ...mockRegistration, openRefunds: [] })
    mockGetRegistration.mockImplementation(() => Promise.resolve(structuredClone(mockRegistration)))
    mockGetEvent.mockResolvedValue(mockConfirmedEvent)
    mockUpdateTransactionStatus.mockResolvedValue(true)
    mockSettleFailedTransaction.mockResolvedValue({ changed: false, moved: false })
    mockApplySuccessfulRefund.mockResolvedValue({ applied: true, appliedAt: '2023-01-01T12:30:00.000Z' })
    mockClearRegistrationEmailDeliveryStatus.mockResolvedValue(undefined)
    mockSendTemplatedMail.mockResolvedValue(undefined)
    mockRegistrationEmailTags.mockImplementation(
      (registration: Pick<JsonRegistration, 'eventId' | 'id'>, template: string) => [
        { Name: 'eventId', Value: registration.eventId },
        { Name: 'registrationId', Value: registration.id },
        { Name: 'template', Value: template },
      ]
    )
    mockRegistrationAuditKey.mockReturnValue('event123:reg456')
  })

  it('throws error if status is missing', async () => {
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      // No status
      provider: 'paytrail',
      registrationId: 'reg456',
      transactionId: 'transaction123',
    })

    await expect(refundSuccessLambda(event)).rejects.toThrow('Bad Request')
    expect(mockReadTransaction).not.toHaveBeenCalled()
  })

  it('reconstructs a missing transaction from a verified success callback', async () => {
    mockReadTransaction.mockResolvedValueOnce(null)

    await refundSuccessLambda(event)

    expect(mockApplySuccessfulRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000,
        reference: 'event123:reg456',
        status: 'new',
        transactionId: 'transaction123',
        type: 'refund',
      }),
      'event123',
      'reg456',
      false
    )
  })

  it('returns early if transaction already has status "ok"', async () => {
    mockReadTransaction.mockResolvedValueOnce({
      ...mockTransaction,
      registrationAppliedAt: '2023-01-01T12:30:00.000Z',
      status: 'ok',
      statusAt: '2023-01-01T12:30:00.000Z',
    })

    await refundSuccessLambda(event)

    expect(mockGetRegistration).not.toHaveBeenCalled()
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  // The fifth writer that settles through the shared step (KOE-1529): a refund-success callback
  // reporting fail is as final as the provider's own cancel callback.
  it('settles a failed refund through the shared step and publishes whatever changed', async () => {
    const cancelled = {
      eventId: 'event123',
      field: 'openRefunds',
      registrationId: 'reg456',
    } satisfies CancelledRegistration
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'fail',
      transactionId: 'transaction123',
    })
    mockSettleFailedTransaction.mockResolvedValueOnce({ cancelled, changed: true, moved: true })

    await refundSuccessLambda(event)

    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')
    expect(mockSettleFailedTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'transaction123' }),
      expect.objectContaining({ eventId: 'event123', id: 'reg456' }),
      'openRefunds',
      { auditActor: expect.any(Function), auditMessage: expect.any(Function), provider: 'paytrail' }
    )
    expect(mockPublishCancelledRegistration).toHaveBeenCalledWith(cancelled)
    expect(mockApplySuccessfulRefund).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('does not publish when the settle step found nothing changed', async () => {
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'fail',
      transactionId: 'transaction123',
    })
    mockSettleFailedTransaction.mockResolvedValueOnce({ changed: false, moved: false })

    await refundSuccessLambda(event)

    expect(mockPublishCancelledRegistration).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('processes successful refund with status "ok"', async () => {
    await refundSuccessLambda(event)

    expect(mockApplySuccessfulRefund).toHaveBeenCalledWith(mockTransaction, 'event123', 'reg456', true)
    // openRefunds comes from a fresh, strongly consistent re-read: applySuccessfulRefund already
    // DELETEd this transaction's id in the same write, and an open admin tab must see that in the
    // patch, not keep showing "palautus kesken" until a reload (KOE-1529, round 1 part 2).
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event123',
      [
        expect.objectContaining({
          emailDeliveryStatus: null,
          eventId: 'event123',
          id: 'reg456',
          openRefunds: [],
          refundStatus: 'SUCCESS',
          updatedAt: expect.any(String),
        }),
      ],
      'org-1'
    )

    expect(mockReadRegistration).toHaveBeenCalledWith('event123', 'reg456', true)

    // Verify email was sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'refund',
      'fi',
      expect.any(String),
      ['payer@example.com'],
      expect.objectContaining({
        amount: '10,00\u00A0€',
        handlingCost: '5,00\u00A0€',
        paidAmount: '20,00\u00A0€',
        providerName: 'Paytrail',
        refundAmount: 10,
        refundStatus: 'SUCCESS',
        status: 'pending',
        transactionId: 'transaction123',
        type: 'refund',
        user: 'Test User',
      }),
      expect.arrayContaining([
        { Name: 'eventId', Value: 'event123' },
        { Name: 'registrationId', Value: 'reg456' },
        { Name: 'template', Value: 'refund' },
      ])
    )

    // Verify audit entry was created
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      messageKey: 'audit.messages.refund',
      messageParams: { amount: '10,00\u00A0€', provider: 'Paytrail' },
      user: 'Test User',
    })
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        messageKey: 'audit.messages.emailSentTo',
        messageParams: expect.objectContaining({ templateKey: 'registration.email.subject' }),
      })
    )

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  // The picture is built from the row as stored, and a failed push is logged without failing the
  // callback: both are publishParticipantPayments' own (lib/payment.test.ts, ws/actions.test.ts).
  it('tells the entrant the refund once it is applied (KOE-1553)', async () => {
    const steps: string[] = []
    mockApplySuccessfulRefund.mockImplementationOnce(async () => {
      steps.push('apply')
      return { applied: true, appliedAt: '2023-01-01T12:30:00.000Z' }
    })
    mockPublishParticipantPayments.mockImplementationOnce(async () => {
      steps.push('tell the entrant')
    })

    await refundSuccessLambda(event)

    expect(mockPublishParticipantPayments).toHaveBeenCalledTimes(1)
    expect(mockPublishParticipantPayments).toHaveBeenCalledWith(mockConfirmedEvent, ['reg456'])
    expect(steps).toEqual(['apply', 'tell the entrant'])
  })

  it('tells the entrant nothing when the refund was already applied (KOE-1553)', async () => {
    mockApplySuccessfulRefund.mockResolvedValueOnce({ applied: false, appliedAt: '2023-01-01T12:30:00.000Z' })

    await refundSuccessLambda(event)

    expect(mockPublishParticipantPayments).not.toHaveBeenCalled()
  })

  it('tells a partial refund without a handling fee as one without a fee (KOE-1459)', async () => {
    mockReadTransaction.mockResolvedValueOnce({ ...mockTransaction, amount: 400, handlingCost: 0 })
    const partialEvent = constructPartialAPIGwEvent({
      queryStringParameters: { ...event.queryStringParameters, 'checkout-amount': '400' },
    })

    await refundSuccessLambda(partialEvent)

    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'refund',
      'fi',
      expect.any(String),
      ['payer@example.com'],
      expect.objectContaining({ amount: '4,00\u00A0€', handlingCost: '0,00\u00A0€', paidAmount: '20,00\u00A0€' }),
      expect.any(Array)
    )
  })

  // Everything is recorded by then: a failed admin push is logged and the callback still answers 200
  // (KOE-1566).
  it('answers 200 and still tells the entrant when the admin patch cannot be sent', async () => {
    mockQueryAdminConnections.mockRejectedValueOnce(new Error('connection table down'))

    await refundSuccessLambda(event)

    expect(mockPublishParticipantPayments).toHaveBeenCalledWith(mockConfirmedEvent, ['reg456'])
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
    expect(loggedLines(errorSpy)).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({ message: 'connection table down' }),
        message: 'live push failed',
        publication: 'registration patches',
      }),
    ])
  })

  it('handles failed email sending gracefully', async () => {
    mockSendTemplatedMail.mockRejectedValueOnce(new Error('Email sending failed'))

    await refundSuccessLambda(event)

    // Verify error was logged
    expect(loggedLines(errorSpy)).toContainEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Email sending failed' }),
        message: 'failed to send refund email',
      })
    )

    // Verify audit entry was still created
    expect(mockAudit).toHaveBeenCalled()

    // Verify response was still returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('skips updates if the refund was already applied', async () => {
    mockApplySuccessfulRefund.mockResolvedValueOnce({ applied: false, appliedAt: '2023-01-01T12:30:00.000Z' })

    await refundSuccessLambda(event)

    // Verify the registration was not read again for a patch
    expect(mockReadRegistration).not.toHaveBeenCalled()

    // Verify email was not sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify audit entry was not created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('verifies params before processing', async () => {
    await refundSuccessLambda(event)

    expect(mockVerifyParams).toHaveBeenCalledWith(event.queryStringParameters)
    expect(mockParseParams).toHaveBeenCalledWith(event.queryStringParameters)
  })

  it('handles empty query parameters', async () => {
    const emptyEvent = constructPartialAPIGwEvent({
      queryStringParameters: null,
    })

    mockParseParams.mockReturnValueOnce({
      // No values
    })

    await expect(refundSuccessLambda(emptyEvent)).rejects.toThrow('Bad Request')
    expect(mockVerifyParams).toHaveBeenCalledWith({})
  })
})
