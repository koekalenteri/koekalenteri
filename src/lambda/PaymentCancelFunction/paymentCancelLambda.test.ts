import type { AuditMessage } from '../../lib/audit'
import type { JsonPaymentTransaction, JsonRegistration } from '../../types'
import type { CancelledRegistration } from '../lib/payment'
import { vi } from 'vitest'
import { answerRejections, constructAPIGwEvent } from '../test-utils/helpers'

interface SettleOptions {
  auditMessage: (transaction: JsonPaymentTransaction, provider: string | undefined) => AuditMessage
  auditActor: (transaction: JsonPaymentTransaction) => { name: string; source?: string }
  provider?: string
}

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockResolveCallbackTransaction = vi.fn()
const mockSettleFailedTransaction = vi.fn<(...args: unknown[]) => Promise<{ cancelled?: unknown }>>()
const mockPublishCancelledRegistration = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/payment', () => ({
  publishCancelledRegistration: mockPublishCancelledRegistration,
  resolveCallbackTransaction: mockResolveCallbackTransaction,
  settleFailedTransaction: mockSettleFailedTransaction,
}))

const { default: paymentCancelLambda } = await import('./handler')

describe('paymentCancelLambda', () => {
  const event = constructAPIGwEvent('', {
    query: {
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'fail',
      'checkout-transaction-id': 'tx123',
    },
  })
  const transaction: JsonPaymentTransaction = {
    amount: 5000,
    createdAt: '2026-08-16T10:00:00.000Z',
    reference: 'event123:reg456',
    stamp: 'stamp-1',
    status: 'pending',
    transactionId: 'tx123',
    type: 'payment',
  }
  const registration = { eventId: 'event123', id: 'reg456' } as JsonRegistration

  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveCallbackTransaction.mockResolvedValue({
      eventId: 'event123',
      provider: 'paytrail',
      registration,
      registrationId: 'reg456',
      transaction,
    })
    mockSettleFailedTransaction.mockResolvedValue({})
    mockResponse.mockReturnValue({ statusCode: 200 })
  })

  it('settles the callback through the shared step, with the provider updated', async () => {
    await paymentCancelLambda(event)

    expect(mockResolveCallbackTransaction).toHaveBeenCalledWith(event.queryStringParameters, 'payment')
    expect(mockSettleFailedTransaction).toHaveBeenCalledWith(transaction, registration, 'openPayments', {
      auditActor: expect.any(Function),
      auditMessage: expect.any(Function),
      provider: 'paytrail',
    })
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('configures payment-specific audit values', async () => {
    await paymentCancelLambda(event)

    const options = mockSettleFailedTransaction.mock.lastCall?.[3] as SettleOptions
    expect(options.auditMessage(transaction, 'paytrail')).toEqual({
      messageKey: 'audit.messages.paymentFailed',
      messageParams: { amount: '50,00 €', provider: 'Paytrail' },
    })
    expect(options.auditActor(transaction)).toEqual({ name: 'anonymous' })
  })

  it('publishes whatever the step found changed', async () => {
    const cancelled = {
      eventId: 'event123',
      field: 'openPayments',
      registrationId: 'reg456',
    } satisfies CancelledRegistration
    mockSettleFailedTransaction.mockResolvedValueOnce({ cancelled })

    await paymentCancelLambda(event)

    expect(mockPublishCancelledRegistration).toHaveBeenCalledWith(cancelled)
  })

  it('does not publish when nothing changed', async () => {
    await paymentCancelLambda(event)

    expect(mockPublishCancelledRegistration).not.toHaveBeenCalled()
  })
})
