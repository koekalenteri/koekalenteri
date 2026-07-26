import type { JsonRefundTransaction, JsonTransaction } from '../../types'
import { jest } from '@jest/globals'

const mockDocumentTransaction = jest.fn<any>()
const mockRead = jest.fn<any>()

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    documentTransaction: mockDocumentTransaction,
    read: mockRead,
  })),
}))

const { applySuccessfulPayment, applySuccessfulRefund } = await import('./payment')

const payment: JsonTransaction = {
  amount: 5000,
  createdAt: '2026-01-01T00:00:00.000Z',
  reference: 'event-1:registration-1',
  stamp: 'stamp-1',
  status: 'pending',
  transactionId: 'transaction-1',
  type: 'payment',
}

describe('atomic payment registration updates', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDocumentTransaction.mockResolvedValue({})
  })

  it('marks a payment applied and increments paidAmount in one transaction', async () => {
    const result = await applySuccessfulPayment(payment, 'event-1', 'registration-1', 'bank', false)

    expect(result.applied).toBe(true)
    expect(mockDocumentTransaction).toHaveBeenCalledWith([
      {
        Update: expect.objectContaining({
          ConditionExpression: expect.stringContaining('attribute_not_exists(registrationAppliedAt)'),
          Key: { transactionId: 'transaction-1' },
          UpdateExpression: expect.stringContaining('registrationAppliedAt'),
        }),
      },
      {
        Update: expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({ ':amount': 50 }),
          Key: { eventId: 'event-1', id: 'registration-1' },
          UpdateExpression: expect.stringContaining('ADD paidAmount :amount'),
        }),
      },
    ])
  })

  it('treats a conditional race as an idempotent retry after a consistent read', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = new Error('conditional check failed')
    error.name = 'TransactionCanceledException'
    mockDocumentTransaction.mockRejectedValueOnce(error)
    mockRead.mockResolvedValueOnce({ ...payment, registrationAppliedAt: '2026-01-01T00:01:00.000Z' })

    const result = await applySuccessfulPayment(payment, 'event-1', 'registration-1', undefined, false)

    expect(result.applied).toBe(false)
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'transaction-1' }, expect.any(String), true)
    expect(logSpy).toHaveBeenCalledWith("Transaction 'transaction-1' was already applied to its registration")
  })

  it('increments refund and handling-cost totals atomically', async () => {
    const refund: JsonRefundTransaction = {
      amount: 1000,
      createdAt: payment.createdAt,
      handlingCost: 250,
      reference: payment.reference,
      stamp: payment.stamp,
      status: payment.status,
      transactionId: 'refund-1',
      type: 'refund',
      user: 'admin',
    }

    await applySuccessfulRefund(refund, 'event-1', 'registration-1')

    expect(mockDocumentTransaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          Update: expect.objectContaining({
            ExpressionAttributeValues: expect.objectContaining({ ':amount': 10, ':handlingCost': 2.5 }),
            UpdateExpression: expect.stringContaining('ADD refundAmount :amount, refundHandlingCost :handlingCost'),
          }),
        },
      ])
    )
  })
})
