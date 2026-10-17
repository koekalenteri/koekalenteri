import { vi } from 'vitest'
import { paymentPictureWith } from '../../__mockData__/paymentPicture'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn().mockImplementation((statusCode: number, body: any) => ({
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
  statusCode,
}))
const mockParseParams = vi.fn()
const mockVerifyParams = vi.fn()
const mockGetRegistration = vi.fn()
const mockGetRegistrationEditToken = vi.fn()
const mockRead = vi.fn()
const mockGetEvent = vi.fn()
const mockPublishCancelledRegistration = vi.fn()
const mockSettleFailedTransaction = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  LambdaError: class LambdaError extends Error {},
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

vi.doMock('../lib/ws/actions', () => ({
  publishCancelledRegistration: mockPublishCancelledRegistration,
}))

// The settle is the shared step every other failure writer uses too, tested in lib/payment; this
// handler only has to hand it the row and send on whatever it answers with (KOE-1526, KOE-1529).
vi.doMock('../lib/payment', () => ({
  parseParams: mockParseParams,
  settleFailedTransaction: mockSettleFailedTransaction,
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
    mockGetEvent.mockResolvedValue({ organizer: { id: 'org-1' } })

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
      openPayments: ['tx123'],
    })
    mockGetRegistrationEditToken.mockReturnValue('edit-token')

    mockSettleFailedTransaction.mockResolvedValue({ changed: false, moved: false })
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
      openPayments: ['tx123'],
    })

    // Verify the settle step was never reached for a successful payment
    expect(mockSettleFailedTransaction).not.toHaveBeenCalled()
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
      participantPatch: { eventId: 'event123', id: 'reg456', payment: paymentPictureWith() },
      patch: { eventId: 'event123', id: 'reg456', openPayments: [] },
      registrationId: 'reg456',
    }
    mockSettleFailedTransaction.mockResolvedValueOnce({ cancelled, changed: true, moved: true })
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

    // Verify registration was retrieved for a failed payment
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Settled through the one step the provider's own cancel callback uses too (KOE-1526, KOE-1529).
    expect(mockSettleFailedTransaction).toHaveBeenCalledWith(
      {
        amount: 5000,
        reference: 'event123:reg456',
        status: 'pending',
        transactionId: 'tx123',
        user: 'user123',
      },
      { eventId: 'event123', id: 'reg456', openPayments: ['tx123'] },
      'openPayments',
      {
        auditActor: expect.any(Function),
        auditMessage: expect.any(Function),
        provider: 'paytrail',
      }
    )
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

  // A toistettu (retried) or racing fail return finds the settle step has nothing left to change
  // (rule 4): the handler still calls it every time, idempotently, and just does not publish again.
  it('calls the settle step every time, but publishes nothing once the transaction has already settled', async () => {
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
      openPayments: [],
    })

    await paymentVerifyLambda(event)

    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')
    expect(mockSettleFailedTransaction).toHaveBeenCalledTimes(1)
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
