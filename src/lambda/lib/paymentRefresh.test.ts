import type { JsonRefundTransaction, JsonRegistration } from '../../types'
import { vi } from 'vitest'

const mockGetPayment = vi.fn()
const mockDynamoUpdate = vi.fn()

vi.doMock('./paytrail', () => ({
  paytrail: { getPayment: mockGetPayment },
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      update: mockDynamoUpdate,
    }
  }),
}))

const { refreshTransactionStatusesFromPaytrail } = await import('./payment')

const registration: JsonRegistration = { eventId: 'event123', id: 'reg456' } as JsonRegistration

describe('refreshTransactionStatusesFromPaytrail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refreshes a failed refund transaction from Paytrail', async () => {
    const transaction: JsonRefundTransaction = {
      amount: 1000,
      createdAt: '2025-01-01T00:00:00.000Z',
      reference: 'event123:reg456',
      stamp: 'stamp123',
      status: 'fail',
      transactionId: 'refund123',
      type: 'refund',
      user: 'Admin',
    }

    mockGetPayment.mockResolvedValueOnce({
      provider: 'paytrail',
      status: 'ok',
      transactionId: 'refund123',
    })

    const refreshed = await refreshTransactionStatusesFromPaytrail([transaction], registration)

    expect(mockGetPayment).toHaveBeenCalledWith('refund123')
    expect(mockDynamoUpdate).toHaveBeenCalledWith(
      { transactionId: 'refund123' },
      {
        remove: ['paymentResponse'],
        set: {
          provider: 'paytrail',
          status: 'ok',
          statusAt: expect.any(String),
        },
      },
      expect.any(String),
      undefined,
      expect.objectContaining({
        expression:
          'attribute_not_exists(registrationAppliedAt) AND attribute_not_exists(duplicatePaymentAt) AND #status <> :fail',
      })
    )
    expect(refreshed).toEqual({
      cancelled: [],
      transactions: [
        {
          ...transaction,
          provider: 'paytrail',
          status: 'ok',
          statusAt: expect.any(String),
        },
      ],
    })
  })

  it('does not refresh an already ok refund transaction', async () => {
    const transaction: JsonRefundTransaction = {
      amount: 1000,
      createdAt: '2025-01-01T00:00:00.000Z',
      reference: 'event123:reg456',
      stamp: 'stamp123',
      status: 'ok',
      transactionId: 'refund123',
      type: 'refund',
      user: 'Admin',
    }

    const refreshed = await refreshTransactionStatusesFromPaytrail([transaction], registration)

    expect(mockGetPayment).not.toHaveBeenCalled()
    expect(mockDynamoUpdate).not.toHaveBeenCalled()
    expect(refreshed).toEqual({ cancelled: [], transactions: [transaction] })
  })
})
