import { vi } from 'vitest'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn().mockImplementation((statusCode: number, body: unknown) => ({
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
  statusCode,
}))
const mockParseParams = vi.fn()
const mockVerifyParams = vi.fn()
const mockGetRegistration = vi.fn()
const mockGetRegistrationEditToken = vi.fn()
const mockRead = vi.fn()
const mockPublishCancelledRegistration = vi.fn()
const mockCancelUnfinishedTransaction = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  LambdaError: class LambdaError extends Error {},
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/ws/actions', () => ({
  publishCancelledRegistration: mockPublishCancelledRegistration,
}))

// The cancel is the step the provider's cancel callback shares, tested in lib/payment: it fails the
// transaction, cancels a PENDING registration and audits once. This handler only hands it the
// transaction and the row, and sends on what it answers (KOE-1526).
vi.doMock('../lib/payment', () => ({
  cancelUnfinishedTransaction: mockCancelUnfinishedTransaction,
  parseParams: mockParseParams,
  verifyParams: mockVerifyParams,
}))

vi.doMock('../lib/registration', () => ({
  getRegistration: mockGetRegistration,
  getRegistrationEditToken: mockGetRegistrationEditToken,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      read: mockRead,
    }
  }),
}))

const { default: paymentVerifyLambda } = await import('./handler')

describe('paymentVerifyLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: JSON.stringify({
      'checkout-amount': '5000',
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'ok',
      'checkout-transaction-id': 'tx123',
    }),
    headers: {},
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockParseParams.mockReturnValue({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'ok',
      transactionId: 'tx123',
    })

    mockVerifyParams.mockResolvedValue(undefined)

    mockRead.mockResolvedValue({
      amount: 5000,
      reference: 'event123:reg456',
      status: 'pending',
      transactionId: 'tx123',
      user: 'user123',
    })

    mockGetRegistration.mockResolvedValue({
      eventId: 'event123',
      id: 'reg456',
      paymentStatus: 'PENDING',
    })
    mockGetRegistrationEditToken.mockReturnValue('edit-token')
  })

  it('verifies a successful payment correctly', async () => {
    const result = await paymentVerifyLambda(event)

    // Verify params were parsed and verified
    expect(mockParseParams).toHaveBeenCalledWith({
      'checkout-amount': '5000',
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'ok',
      'checkout-transaction-id': 'tx123',
    })
    expect(mockVerifyParams).toHaveBeenCalledWith({
      'checkout-amount': '5000',
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'ok',
      'checkout-transaction-id': 'tx123',
    })

    // Verify transaction was retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')
    expect(mockGetRegistrationEditToken).toHaveBeenCalledWith({
      eventId: 'event123',
      id: 'reg456',
      paymentStatus: 'PENDING',
    })

    // A successful return cancels nothing and sends nothing on
    expect(mockCancelUnfinishedTransaction).not.toHaveBeenCalled()
    expect(mockPublishCancelledRegistration).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        editToken: 'edit-token',
        eventId: 'event123',
        paymentStatus: 'ok',
        registrationId: 'reg456',
        status: 'ok',
      },
      event
    )

    // Verify the result
    expect(result).toEqual(
      expect.objectContaining({
        body: expect.any(String),
        statusCode: 200,
      })
    )
  })

  it('handles a failed payment correctly', async () => {
    const cancelled = {
      eventId: 'event123',
      organizerId: 'org-1',
      participantPatch: { eventId: 'event123', id: 'reg456', paymentStatus: 'CANCEL', shouldPay: true },
      patch: { eventId: 'event123', id: 'reg456', paymentStatus: 'CANCEL', updatedAt: '2026-08-01T00:00:00.000Z' },
      registrationId: 'reg456',
    }
    let auditMessage: unknown
    mockCancelUnfinishedTransaction.mockImplementationOnce(
      async (step: {
        auditMessage: (transaction: unknown, provider?: string) => unknown
        transaction: unknown
        provider?: string
      }) => {
        auditMessage = step.auditMessage(step.transaction, step.provider)
        return cancelled
      }
    )
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'fail',
      transactionId: 'tx123',
    })

    await paymentVerifyLambda(event)

    // Verify transaction was retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

    // Verify registration was retrieved for failed payment
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // The cancel is written and sent on to the admins and to the participant's open page alike:
    // a page still holding PENDING gets its pay button back without a reload (KOE-1526).
    // The transaction is handed over to fail too, so the payment page cannot reuse it, and the
    // audit is the shared step's: the one cancel is recorded once (KOE-1526).
    expect(mockCancelUnfinishedTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'paytrail',
        registration: { eventId: 'event123', id: 'reg456', paymentStatus: 'PENDING' },
        statusField: 'paymentStatus',
        transaction: expect.objectContaining({ transactionId: 'tx123' }),
        updateProvider: true,
      })
    )
    expect(auditMessage).toMatchObject({
      messageKey: 'audit.messages.paymentFailed',
      messageParams: { amount: '50,00\u00a0€', provider: 'Paytrail' },
    })
    expect(mockPublishCancelledRegistration).toHaveBeenCalledWith(cancelled)

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        editToken: 'edit-token',
        eventId: 'event123',
        paymentStatus: 'fail',
        registrationId: 'reg456',
        status: 'error',
      },
      event
    )
  })

  it('sends nothing on when the shared step cancelled nothing', async () => {
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'fail',
      transactionId: 'tx123',
    })

    mockGetRegistration.mockResolvedValueOnce({
      eventId: 'event123',
      id: 'reg456',
      paymentStatus: 'CANCEL', // Already cancelled
    })

    await paymentVerifyLambda(event)

    // Verify registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // The step finds the registration no longer PENDING and answers nothing to send on
    expect(mockCancelUnfinishedTransaction).toHaveBeenCalledTimes(1)
    expect(mockPublishCancelledRegistration).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        editToken: 'edit-token',
        eventId: 'event123',
        paymentStatus: 'fail',
        registrationId: 'reg456',
        status: 'error',
      },
      event
    )
  })

  it('throws error if transaction is not found', async () => {
    mockRead.mockResolvedValueOnce(null)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await paymentVerifyLambda(event)

    // Verify transaction was attempted to be retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

    // Verify error was logged
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()

    // Verify response was returned with error status
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        eventId: 'event123',
        paymentStatus: 'ok',
        registrationId: 'reg456',
        status: 'error',
      },
      event
    )
  })

  it('handles verification errors gracefully', async () => {
    const error = new Error('Verification failed')
    mockVerifyParams.mockRejectedValueOnce(error)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await paymentVerifyLambda(event)

    // Verify error was logged
    expect(loggedLines(consoleSpy)).toContainEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Verification failed' }),
        message: 'failed to verify payment',
      })
    )

    // Verify response was returned with error status
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        eventId: 'event123',
        paymentStatus: 'ok',
        registrationId: 'reg456',
        status: 'error',
      },
      event
    )

    consoleSpy.mockRestore()
  })

  it('handles other errors gracefully', async () => {
    const error = new Error('Unexpected error')
    mockRead.mockRejectedValueOnce(error)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await paymentVerifyLambda(event)

    // Verify error was logged
    expect(loggedLines(consoleSpy)).toContainEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Unexpected error' }),
        message: 'failed to verify payment',
      })
    )

    // Verify response was returned with error status
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        eventId: 'event123',
        paymentStatus: 'ok',
        registrationId: 'reg456',
        status: 'error',
      },
      event
    )

    consoleSpy.mockRestore()
  })
})
