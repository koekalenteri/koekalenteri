import type { AuditMessage } from '../../lib/audit'
import type { JsonRefundTransaction } from '../../types'
import type { CancelledRegistration } from '../lib/payment'
import { vi } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

interface SettleOptions {
  auditMessage: (transaction: JsonRefundTransaction, provider: string | undefined) => AuditMessage
}

const mockResolveCallbackTransaction = vi.fn()
const mockSettleFailedTransaction = vi.fn<(...args: unknown[]) => Promise<{ cancelled?: unknown }>>()
const mockPublishCancelledRegistration = vi.fn()

vi.doMock('../lib/payment', () => ({
  publishCancelledRegistration: mockPublishCancelledRegistration,
  resolveCallbackTransaction: mockResolveCallbackTransaction,
  settleFailedTransaction: mockSettleFailedTransaction,
}))

const { default: refundCancelLambda } = await import('./handler')

describe('refundCancelLambda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

  const transaction = (provider?: string): JsonRefundTransaction => ({
    amount: 1000,
    createdAt: '2026-08-16T10:00:00.000Z',
    ...(provider ? { provider } : {}),
    reference: 'event123:reg456',
    stamp: 'stamp-1',
    status: 'pending',
    transactionId: 'tx123',
    type: 'refund',
    user: 'Sihteeri',
  })
  const registration = { eventId: 'event123', id: 'reg456' }

  beforeEach(() => {
    mockSettleFailedTransaction.mockResolvedValue({})
    mockResolveCallbackTransaction.mockResolvedValue({
      eventId: 'event123',
      provider: undefined,
      registration,
      registrationId: 'reg456',
      transaction: transaction(),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return 200 when checkout-transaction-id is missing', async () => {
    const res = await refundCancelLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(200)
    expect(loggedLines(infoSpy)).toContainEqual(
      expect.objectContaining({
        message:
          'request did not contain transaction-id, this happens when transaction was not actually created, ignoring request',
      })
    )
    expect(mockResolveCallbackTransaction).not.toHaveBeenCalled()
  })

  // Not updateProvider: the write reads the transaction's own stored provider, not the callback's
  // (KOE-1529, same as before).
  it('does not pass a provider along to be written', async () => {
    await refundCancelLambda(constructAPIGwEvent('test', { query: { 'checkout-transaction-id': 'tx123' } }))

    expect(mockSettleFailedTransaction).toHaveBeenCalledWith(
      transaction(),
      registration,
      'openRefunds',
      expect.not.objectContaining({ provider: expect.anything() })
    )
  })

  // The failed refund is named by its key, the provider by its display name as the other refund rows
  // name it, and the amount as parts (KOE-1442).
  it.each([
    ['nordea', 'Nordea'],
    ['email refund', 'Sähköposti + tilisiirto'],
  ])('audits a failed refund through %s', async (provider, providerParam) => {
    let audited: AuditMessage | undefined
    mockSettleFailedTransaction.mockImplementationOnce(async (...args: unknown[]) => {
      const options = args[3] as SettleOptions
      audited = options.auditMessage(transaction(provider), undefined)
      return {}
    })

    const res = await refundCancelLambda(constructAPIGwEvent('test', { query: { 'checkout-transaction-id': 'tx123' } }))

    expect(res.statusCode).toEqual(200)
    expect(audited).toEqual({
      messageKey: 'audit.messages.refundFailed',
      messageParams: { amount: '10,00 €', provider: providerParam },
    })
  })

  it('publishes whatever the step found changed', async () => {
    const cancelled = {
      eventId: 'event123',
      field: 'openRefunds',
      registrationId: 'reg456',
    } satisfies CancelledRegistration
    mockSettleFailedTransaction.mockResolvedValueOnce({ cancelled })

    await refundCancelLambda(constructAPIGwEvent('test', { query: { 'checkout-transaction-id': 'tx123' } }))

    expect(mockPublishCancelledRegistration).toHaveBeenCalledWith(cancelled)
  })

  it('does not publish when nothing changed', async () => {
    await refundCancelLambda(constructAPIGwEvent('test', { query: { 'checkout-transaction-id': 'tx123' } }))

    expect(mockPublishCancelledRegistration).not.toHaveBeenCalled()
  })
})
