import type { JsonPaymentTransaction, JsonRefundTransaction } from '../../../types'
import { uniqueId } from '../../test-utils/integration'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { readTransactionsByReference } from './transactionRepository'

describe('readTransactionsByReference against DynamoDB-local', () => {
  const client = new CustomDynamoClient('TransactionTable')

  const payment = (reference: string): JsonPaymentTransaction => ({
    amount: 5000,
    createdAt: '2026-05-01T10:00:00.000Z',
    reference,
    stamp: uniqueId('stamp'),
    status: 'ok',
    transactionId: uniqueId('payment'),
    type: 'payment',
  })

  const refund = (reference: string): JsonRefundTransaction => ({
    amount: 5000,
    createdAt: '2026-05-02T10:00:00.000Z',
    reference,
    stamp: uniqueId('stamp'),
    status: 'ok',
    transactionId: uniqueId('refund'),
    type: 'refund',
    user: 'secretary',
  })

  it('reads the payment and the refund of one reference through gsiReference, and nothing of another', async () => {
    const reference = uniqueId('reference')
    const rows = [payment(reference), refund(reference)]
    await client.batchWrite([...rows, payment(uniqueId('reference'))])

    const transactions = await readTransactionsByReference(reference)

    expect(transactions?.toSorted((a, b) => a.transactionId.localeCompare(b.transactionId))).toEqual(
      rows.toSorted((a, b) => a.transactionId.localeCompare(b.transactionId))
    )
  })

  it('reads nothing for a reference without transactions', async () => {
    await expect(readTransactionsByReference(uniqueId('reference'))).resolves.toEqual([])
  })
})
