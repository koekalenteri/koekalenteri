import type { JsonRefundTransaction, JsonRegistration } from '../../types'
import { vi } from 'vitest'

const mockGetPayment = vi.fn()
const mockUpdateUnresolvedTransaction = vi.fn()
const mockFailUnfinishedTransaction = vi.fn()
const mockDropOpenTransactionId = vi.fn()
const mockReadRegistrationConsistently = vi.fn()
const mockReadPaymentTransactions = vi.fn()
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

vi.doMock('./repositories/transactionRepository', () => ({
  failUnfinishedTransaction: mockFailUnfinishedTransaction,
  readPaymentTransactions: mockReadPaymentTransactions,
  updateUnresolvedTransaction: mockUpdateUnresolvedTransaction,
}))

vi.doMock('./repositories/registrationRepository', () => ({
  dropOpenTransactionId: mockDropOpenTransactionId,
  readRegistrationConsistently: mockReadRegistrationConsistently,
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
    mockUpdateUnresolvedTransaction.mockResolvedValueOnce(true)

    const refreshed = await refreshTransactionStatusesFromPaytrail([transaction], registration)

    expect(mockGetPayment).toHaveBeenCalledWith('refund123')
    expect(mockUpdateUnresolvedTransaction).toHaveBeenCalledWith('refund123', {
      remove: ['paymentResponse'],
      set: {
        provider: 'paytrail',
        status: 'ok',
        statusAt: expect.any(String),
      },
    })
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
    mockFailUnfinishedTransaction.mockResolvedValueOnce(true)
    mockDropOpenTransactionId.mockResolvedValueOnce(['refund123'])
    mockReadRegistrationConsistently.mockResolvedValueOnce({ ...registration, openRefunds: [] })
    mockGetEvent.mockResolvedValueOnce({
      cost: 50,
      costMember: 50,
      entryStartDate: '2025-01-01T00:00:00.000Z',
      organizer: { id: 'org-1' },
      state: 'confirmed',
    })
    mockReadPaymentTransactions.mockResolvedValueOnce([])

    const refreshed = await refreshTransactionStatusesFromPaytrail([transaction], registration)

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ auditKey: 'event123:reg456', messageKey: 'audit.messages.refundFailed' })
    )
    expect(mockFailUnfinishedTransaction).toHaveBeenCalledWith('refund123', 'paytrail', expect.any(String))
    expect(mockDropOpenTransactionId).toHaveBeenCalledWith(
      'event123',
      'reg456',
      'openRefunds',
      'refund123',
      expect.any(String)
    )
    expect(mockUpdateUnresolvedTransaction).not.toHaveBeenCalled()
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
    expect(mockUpdateUnresolvedTransaction).not.toHaveBeenCalled()
    expect(refreshed).toEqual({ cancelled: [], transactions: [transaction] })
  })
})
