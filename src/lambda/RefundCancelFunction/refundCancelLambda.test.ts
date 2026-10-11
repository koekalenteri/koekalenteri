import type { AuditMessage } from '../../lib/audit'
import type { JsonRefundTransaction } from '../../types'
import { vi } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

interface CancelOptions {
  auditMessage: (transaction: JsonRefundTransaction, provider: string | undefined) => AuditMessage
}

const mockCancelTransaction = vi.fn<(options: CancelOptions) => Promise<undefined>>()

vi.doMock('../lib/payment', () => ({ cancelTransaction: mockCancelTransaction }))

const { default: refundCancelLambda } = await import('./handler')

describe('refundCancelLambda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

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
  })

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

  // The failed refund is named by its key, the provider and the amount as parts (KOE-1442).
  it.each([
    ['nordea', 'Palautus epäonnistui (nordea), 10,00 €', 'nordea'],
    [undefined, 'Palautus epäonnistui (), 10,00 €', ''],
  ])('audits a failed refund through %s', async (provider, message, providerParam) => {
    let audited: AuditMessage | undefined
    mockCancelTransaction.mockImplementationOnce(async ({ auditMessage }) => {
      audited = auditMessage(transaction(provider), undefined)
      return undefined
    })

    const res = await refundCancelLambda(constructAPIGwEvent('test', { query: { 'checkout-transaction-id': 'tx123' } }))

    expect(res.statusCode).toEqual(200)
    expect(audited).toEqual({
      message,
      messageKey: 'audit.messages.refundFailed',
      messageParams: { amount: '10,00 €', provider: providerParam },
    })
  })
})
