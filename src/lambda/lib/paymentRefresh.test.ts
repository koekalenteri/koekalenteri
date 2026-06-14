import type { JsonRefundTransaction } from '../../types'
import { jest } from '@jest/globals'

const mockGetPayment = jest.fn<any>()
const mockDynamoUpdate = jest.fn<any>()

jest.unstable_mockModule('./paytrail', () => ({
  calculateHmac: jest.fn(),
  getPayment: mockGetPayment,
  HMAC_KEY_PREFIX: 'checkout-',
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    update: mockDynamoUpdate,
  })),
}))

const { refreshTransactionStatusesFromPaytrail } = await import('./payment')

describe('refreshTransactionStatusesFromPaytrail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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

    const refreshed = await refreshTransactionStatusesFromPaytrail([transaction])

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
      expect.any(String)
    )
    expect(refreshed).toEqual([
      {
        ...transaction,
        provider: 'paytrail',
        status: 'ok',
        statusAt: expect.any(String),
      },
    ])
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

    const refreshed = await refreshTransactionStatusesFromPaytrail([transaction])

    expect(mockGetPayment).not.toHaveBeenCalled()
    expect(mockDynamoUpdate).not.toHaveBeenCalled()
    expect(refreshed).toEqual([transaction])
  })
})
