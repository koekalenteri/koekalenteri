import type { JsonPaymentTransaction, JsonRefundTransaction, JsonRegistration } from '../../../types'
import { uniqueId } from '../../test-utils/integration'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import {
  applySuccessfulPayment,
  readTransaction,
  readTransactionsByReference,
  recordDuplicatePayment,
} from './transactionRepository'

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

describe('the outcome of a payment against DynamoDB-local', () => {
  const transactions = new CustomDynamoClient('TransactionTable')
  const registrations = new CustomDynamoClient('EventRegistrationTable')

  /** A payment still open on a registration still being created, under ids of their own. */
  const arrangeOpenPayment = async () => {
    const eventId = uniqueId('event')
    const registrationId = uniqueId('registration')
    const transaction: JsonPaymentTransaction = {
      amount: 5000,
      createdAt: '2026-05-01T10:00:00.000Z',
      reference: `${eventId}:${registrationId}`,
      stamp: uniqueId('stamp'),
      status: 'pending',
      transactionId: uniqueId('payment'),
      type: 'payment',
    }
    await transactions.write(transaction)
    await registrations.write({
      eventId,
      id: registrationId,
      openPayments: new Set([transaction.transactionId]),
      paymentStatus: 'PENDING',
      state: 'creating',
    })
    return { eventId, registrationId, transaction }
  }

  const readRegistration = (eventId: string, id: string) =>
    registrations.read<JsonRegistration>({ eventId, id }, undefined, true)

  const duplicateOf = (registrationId: string, duplicatePaymentAt = '2026-05-01T10:05:00.000Z') => ({
    duplicateOfRegistrationId: registrationId,
    duplicatePaymentAt,
    provider: 'nordea',
  })

  it('records a duplicate on the transaction and its registration once, and a retry writes nothing', async () => {
    const { eventId, registrationId, transaction } = await arrangeOpenPayment()

    await expect(
      recordDuplicatePayment(transaction, eventId, registrationId, duplicateOf('registration-0'))
    ).resolves.toEqual({ recorded: true })
    await expect(
      recordDuplicatePayment(
        transaction,
        eventId,
        registrationId,
        duplicateOf('registration-1', '2026-05-01T10:06:00.000Z')
      )
    ).resolves.toEqual({ recorded: false })

    expect(await readTransaction(transaction.transactionId)).toMatchObject({
      duplicateOfRegistrationId: 'registration-0',
      duplicatePaymentAt: '2026-05-01T10:05:00.000Z',
      provider: 'nordea',
      status: 'ok',
    })
    const registration = await readRegistration(eventId, registrationId)
    expect(registration).toMatchObject({ paymentStatus: 'DUPLICATE', updatedAt: '2026-05-01T10:05:00.000Z' })
    expect(registration?.openPayments).toBeUndefined()
  })

  it('does not apply a payment recorded as a duplicate', async () => {
    const { eventId, registrationId, transaction } = await arrangeOpenPayment()
    await recordDuplicatePayment(transaction, eventId, registrationId, duplicateOf('registration-0'))

    await expect(applySuccessfulPayment(transaction, eventId, registrationId, 'nordea', false)).resolves.toMatchObject({
      applied: false,
    })

    const registration = await readRegistration(eventId, registrationId)
    expect(registration).toMatchObject({ paymentStatus: 'DUPLICATE', state: 'creating' })
    expect(registration?.paidAmount).toBeUndefined()
    expect(await readTransaction(transaction.transactionId)).not.toHaveProperty('registrationAppliedAt')
  })

  it('does not record an applied payment as a duplicate', async () => {
    const { eventId, registrationId, transaction } = await arrangeOpenPayment()
    await applySuccessfulPayment(transaction, eventId, registrationId, 'nordea', false)

    await expect(
      recordDuplicatePayment(transaction, eventId, registrationId, duplicateOf('registration-0'))
    ).resolves.toEqual({ recorded: false })

    expect(await readTransaction(transaction.transactionId)).not.toHaveProperty('duplicatePaymentAt')
    expect(await readRegistration(eventId, registrationId)).toMatchObject({
      paidAmount: 50,
      paymentStatus: 'SUCCESS',
      state: 'ready',
    })
  })
})
