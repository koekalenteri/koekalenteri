import type { JsonPaymentTransaction } from '../../types'
import { vi } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'

interface CancelOptions {
  auditMessage: (transaction: JsonPaymentTransaction, provider: string | undefined) => string
  auditUser: (transaction: JsonPaymentTransaction) => string
  params: Record<string, string>
  statusField: string
  updateProvider: boolean
}

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockCancelTransaction = vi.fn<(options: CancelOptions) => Promise<void>>()

vi.doMock('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/payment', () => ({
  cancelTransaction: mockCancelTransaction,
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

  beforeEach(() => {
    vi.clearAllMocks()
    mockCancelTransaction.mockResolvedValue(undefined)
    mockResponse.mockReturnValue({ statusCode: 200 })
  })

  it('delegates the callback to the shared cancellation workflow', async () => {
    await paymentCancelLambda(event)

    expect(mockCancelTransaction).toHaveBeenCalledWith({
      auditMessage: expect.any(Function),
      auditUser: expect.any(Function),
      params: event.queryStringParameters,
      statusField: 'paymentStatus',
      updateProvider: true,
    })
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('configures payment-specific audit values', async () => {
    const transaction: JsonPaymentTransaction = {
      amount: 5000,
      createdAt: '2026-08-16T10:00:00.000Z',
      reference: 'event123:reg456',
      stamp: 'stamp-1',
      status: 'pending',
      transactionId: 'tx123',
      type: 'payment',
    }

    await paymentCancelLambda(event)

    const options = mockCancelTransaction.mock.lastCall?.[0]
    expect(options?.auditMessage(transaction, 'paytrail')).toBe('Maksu epäonnistui (Paytrail), 50,00 €')
    expect(options?.auditUser(transaction)).toBe('anonymous')
  })
})
