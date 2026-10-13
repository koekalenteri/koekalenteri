import type { JsonRefundTransaction, JsonRegistration } from '../../types'
import { vi } from 'vitest'

const mockGetPayment = vi.fn()
const mockDynamoUpdate = vi.fn()
const mockDynamoRead = vi.fn()
const mockBatchGet = vi.fn()
const mockAudit = vi.fn()
const mockGetEvent = vi.fn()

vi.doMock('./paytrail', () => ({
  paytrail: { getPayment: mockGetPayment },
}))

vi.doMock('./audit', () => ({
  audit: mockAudit,
  registrationAuditKey: (registration: { eventId: string; id: string }) => `${registration.eventId}:${registration.id}`,
}))

vi.doMock('./event', () => ({ getEvent: mockGetEvent }))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      batchGet: mockBatchGet,
      read: mockDynamoRead,
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

  // The sixth writer that can find a transaction failed (rule 4, KOE-1529): a refund Paytrail now
  // reports fail settles through the same shared step, not a bare status write.
  it('settles a refund Paytrail now reports fail, through the shared step', async () => {
    const transaction: JsonRefundTransaction = {
      amount: 1000,
      createdAt: '2025-01-01T00:00:00.000Z',
      reference: 'event123:reg456',
      stamp: 'stamp123',
      status: 'pending',
      transactionId: 'refund123',
      type: 'refund',
      user: 'Admin',
    }

    mockGetPayment.mockResolvedValueOnce({
      provider: 'paytrail',
      status: 'fail',
      transactionId: 'refund123',
    })
    mockDynamoUpdate.mockResolvedValueOnce({}) // failUnfinishedTransaction
    mockDynamoUpdate.mockResolvedValueOnce({ Attributes: { openRefunds: ['refund123'] } }) // dropOpenTransaction
    mockDynamoRead.mockResolvedValueOnce({ ...registration, openRefunds: [] }) // the strongly consistent re-read
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-1' } })
    mockBatchGet.mockResolvedValueOnce([])

    const refreshed = await refreshTransactionStatusesFromPaytrail([transaction], registration)

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ auditKey: 'event123:reg456', messageKey: 'audit.messages.refundFailed' })
    )
    expect(refreshed.cancelled).toHaveLength(1)
    expect(refreshed.cancelled[0]).toMatchObject({ eventId: 'event123', registrationId: 'reg456' })
    expect(refreshed.transactions).toEqual([
      { ...transaction, provider: 'paytrail', status: 'fail', statusAt: expect.any(String) },
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

    const refreshed = await refreshTransactionStatusesFromPaytrail([transaction], registration)

    expect(mockGetPayment).not.toHaveBeenCalled()
    expect(mockDynamoUpdate).not.toHaveBeenCalled()
    expect(refreshed).toEqual({ cancelled: [], transactions: [transaction] })
  })
})
