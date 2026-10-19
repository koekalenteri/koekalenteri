import type { JsonPaymentTransaction, JsonRefundTransaction } from '../../../types'
import { vi } from 'vitest'
import { loggedLines } from '../../test-utils/logs'

const mockBatchGet = vi.fn()
const mockDocumentTransaction = vi.fn()
const mockQuery = vi.fn()
const mockRead = vi.fn()
const mockUpdate = vi.fn()
const mockWrite = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { registrationTable: 'registration-table', transactionTable: 'transaction-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    batchGet = (...args: unknown[]) => mockBatchGet(...args)
    documentTransaction = (...args: unknown[]) => mockDocumentTransaction(...args)
    query = (...args: unknown[]) => mockQuery(...args)
    read = (...args: unknown[]) => mockRead(...args)
    update = (...args: unknown[]) => mockUpdate(...args)
    write = (...args: unknown[]) => mockWrite(...args)
  },
}))

const {
  applySuccessfulPayment,
  applySuccessfulRefund,
  claimPostPaymentWorkflow,
  createPaymentTransaction,
  createPendingRefundTransaction,
  createSettledRefundTransaction,
  failUnfinishedTransaction,
  markPostPaymentPhase,
  readPaymentTransactions,
  readTransaction,
  readTransactionsByReference,
  recordDuplicatePayment,
  updateUnresolvedTransaction,
} = await import('./transactionRepository')

const NOW = '2026-10-19T12:00:00.000Z'

const namedError = (name: string) => {
  const error = new Error(name)
  error.name = name
  return error
}

const payment: JsonPaymentTransaction = {
  amount: 5000,
  createdAt: '2026-01-01T00:00:00.000Z',
  reference: 'event-1:registration-1',
  stamp: 'stamp-1',
  status: 'pending',
  transactionId: 'transaction-1',
  type: 'payment',
}

const refund: JsonRefundTransaction = {
  amount: 1000,
  createdAt: '2026-01-01T00:00:00.000Z',
  handlingCost: 250,
  reference: 'event-1:registration-1',
  stamp: 'stamp-2',
  status: 'pending',
  transactionId: 'refund-1',
  type: 'refund',
  user: 'admin',
}

/** The condition every writer that must not write over a settled transaction carries (KOE-1529). */
const UNRESOLVED_CONDITION = {
  expression:
    'attribute_not_exists(registrationAppliedAt) AND attribute_not_exists(duplicatePaymentAt) AND #status <> :fail',
  names: { '#status': 'status' },
  values: { ':fail': 'fail' },
}

describe('transactionRepository', () => {
  beforeEach(() => {
    mockBatchGet.mockReset()
    mockDocumentTransaction.mockReset()
    mockQuery.mockReset()
    mockRead.mockReset()
    mockUpdate.mockReset()
    mockWrite.mockReset()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(NOW))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens its client on the transaction table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('transaction-table')
  })

  describe('reads', () => {
    it('reads a transaction by its id', async () => {
      mockRead.mockResolvedValueOnce(payment)

      await expect(readTransaction('transaction-1')).resolves.toBe(payment)
      expect(mockRead).toHaveBeenCalledWith({ transactionId: 'transaction-1' })
    })

    it('reads the transactions of one reference through gsiReference', async () => {
      mockQuery.mockResolvedValueOnce([payment, refund])

      await expect(readTransactionsByReference('event-1:registration-1')).resolves.toEqual([payment, refund])
      expect(mockQuery).toHaveBeenCalledWith({
        index: 'gsiReference',
        key: '#reference = :reference',
        names: { '#reference': 'reference' },
        values: { ':reference': 'event-1:registration-1' },
      })
    })

    it('reads payments by their ids in one batch', async () => {
      mockBatchGet.mockResolvedValueOnce([payment])

      await expect(readPaymentTransactions(['transaction-1', 'transaction-2'])).resolves.toEqual([payment])
      expect(mockBatchGet).toHaveBeenCalledWith([
        { transactionId: 'transaction-1' },
        { transactionId: 'transaction-2' },
      ])
    })
  })

  describe('creating a transaction', () => {
    it('stores a new payment and opens it on its registration in one transaction', async () => {
      await createPaymentTransaction(payment, 'event-1', 'registration-1', NOW)

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Put: {
            ConditionExpression: 'attribute_not_exists(transactionId)',
            Item: payment,
            TableName: 'transaction-table',
          },
        },
        {
          Update: {
            ConditionExpression: 'attribute_exists(id)',
            ExpressionAttributeValues: { ':transactionId': new Set(['transaction-1']), ':updatedAt': NOW },
            Key: { eventId: 'event-1', id: 'registration-1' },
            TableName: 'registration-table',
            UpdateExpression:
              'SET updatedAt = :updatedAt REMOVE paymentCreationAt, paymentCreationStamp ADD openPayments :transactionId',
          },
        },
      ])
    })

    it('stores a pending refund and only opens it on its registration', async () => {
      await createPendingRefundTransaction(refund, 'event-1', 'registration-1', NOW)

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Put: {
            ConditionExpression: 'attribute_not_exists(transactionId)',
            Item: refund,
            TableName: 'transaction-table',
          },
        },
        {
          Update: {
            ConditionExpression: 'attribute_exists(id)',
            ExpressionAttributeValues: { ':transactionId': new Set(['refund-1']), ':updatedAt': NOW },
            Key: { eventId: 'event-1', id: 'registration-1' },
            TableName: 'registration-table',
            UpdateExpression:
              'SET updatedAt = :updatedAt REMOVE refundCreationAt, refundCreationStamp ADD openRefunds :transactionId',
          },
        },
      ])
    })

    it('stores a settled refund and marks its registration refunded in the same transaction', async () => {
      await createSettledRefundTransaction(refund, 'event-1', 'registration-1', NOW)

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Put: {
            ConditionExpression: 'attribute_not_exists(transactionId)',
            Item: refund,
            TableName: 'transaction-table',
          },
        },
        {
          Update: {
            ConditionExpression: 'attribute_exists(id)',
            ExpressionAttributeNames: { '#status': 'refundStatus' },
            ExpressionAttributeValues: {
              ':status': 'SUCCESS',
              ':transactionId': new Set(['refund-1']),
              ':updatedAt': NOW,
            },
            Key: { eventId: 'event-1', id: 'registration-1' },
            TableName: 'registration-table',
            UpdateExpression:
              'SET #status = :status, updatedAt = :updatedAt REMOVE refundCreationAt, refundCreationStamp ADD openRefunds :transactionId',
          },
        },
      ])
    })
  })

  describe('writes conditioned on an unresolved transaction', () => {
    it('fails an unfinished transaction, naming the provider', async () => {
      mockUpdate.mockResolvedValueOnce({})

      await expect(failUnfinishedTransaction('transaction-1', 'nordea', '2026-10-19T12:00:01.000Z')).resolves.toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        { transactionId: 'transaction-1' },
        {
          remove: ['paymentResponse'],
          set: { provider: 'nordea', status: 'fail', statusAt: '2026-10-19T12:00:01.000Z' },
        },
        undefined,
        undefined,
        UNRESOLVED_CONDITION
      )
    })

    it('fails an unfinished transaction now, without a provider', async () => {
      mockUpdate.mockResolvedValueOnce({})

      await expect(failUnfinishedTransaction('transaction-1')).resolves.toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        { transactionId: 'transaction-1' },
        { remove: ['paymentResponse'], set: { status: 'fail', statusAt: NOW } },
        undefined,
        undefined,
        UNRESOLVED_CONDITION
      )
    })

    it('answers false when the transaction was already settled', async () => {
      mockUpdate.mockRejectedValueOnce(namedError('ConditionalCheckFailedException'))

      await expect(failUnfinishedTransaction('transaction-1')).resolves.toBe(false)
    })

    it('writes a status update on an unresolved transaction', async () => {
      mockUpdate.mockResolvedValueOnce({})
      const actions = { set: { status: 'pending', statusAt: NOW } }

      await expect(updateUnresolvedTransaction('transaction-1', actions)).resolves.toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        { transactionId: 'transaction-1' },
        actions,
        undefined,
        undefined,
        UNRESOLVED_CONDITION
      )
    })

    it('answers false for a status update on a settled transaction', async () => {
      mockUpdate.mockRejectedValueOnce(namedError('ConditionalCheckFailedException'))

      await expect(updateUnresolvedTransaction('transaction-1', { set: { status: 'pending' } })).resolves.toBe(false)
    })

    it('rethrows any other failure', async () => {
      const error = namedError('ProvisionedThroughputExceededException')
      mockUpdate.mockRejectedValueOnce(error)

      await expect(updateUnresolvedTransaction('transaction-1', { set: { status: 'pending' } })).rejects.toBe(error)
    })
  })

  describe('recordDuplicatePayment', () => {
    const duplicate = { duplicateOfRegistrationId: 'registration-0', duplicatePaymentAt: NOW, provider: 'nordea' }
    const registrationItem = {
      Update: {
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeValues: {
          ':duplicate': 'DUPLICATE',
          ':duplicatePaymentAt': NOW,
          // DynamoDB's set-difference action; this transaction is no longer open (KOE-1529).
          ':transactionId': new Set(['transaction-1']),
        },
        Key: { eventId: 'event-1', id: 'registration-1' },
        TableName: 'registration-table',
        UpdateExpression:
          'SET paymentStatus = :duplicate, updatedAt = :duplicatePaymentAt DELETE openPayments :transactionId',
      },
    }

    it('marks a stored transaction and its registration a duplicate in one transaction', async () => {
      mockDocumentTransaction.mockResolvedValueOnce(undefined)

      await expect(recordDuplicatePayment(payment, 'event-1', 'registration-1', duplicate)).resolves.toEqual({
        recorded: true,
      })
      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Update: {
            // Not the unresolved condition: a payment this app had failed is still money that arrived,
            // as for applySuccessfulPayment (KOE-1529). Only one outcome is ever written.
            ConditionExpression:
              'attribute_exists(transactionId) AND attribute_not_exists(registrationAppliedAt) AND attribute_not_exists(duplicatePaymentAt)',
            ExpressionAttributeNames: { '#provider': 'provider', '#status': 'status' },
            ExpressionAttributeValues: {
              ':duplicateOfRegistrationId': 'registration-0',
              ':duplicatePaymentAt': NOW,
              ':ok': 'ok',
              ':provider': 'nordea',
            },
            Key: { transactionId: 'transaction-1' },
            TableName: 'transaction-table',
            UpdateExpression:
              'SET duplicateOfRegistrationId = :duplicateOfRegistrationId, duplicatePaymentAt = :duplicatePaymentAt, #status = :ok, statusAt = :duplicatePaymentAt, #provider = :provider REMOVE paymentResponse',
          },
        },
        registrationItem,
      ])
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockWrite).not.toHaveBeenCalled()
    })

    it('names no provider it was not given', async () => {
      mockDocumentTransaction.mockResolvedValueOnce(undefined)

      await recordDuplicatePayment(payment, 'event-1', 'registration-1', { ...duplicate, provider: undefined })

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Update: expect.objectContaining({
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':duplicateOfRegistrationId': 'registration-0',
              ':duplicatePaymentAt': NOW,
              ':ok': 'ok',
            },
            UpdateExpression:
              'SET duplicateOfRegistrationId = :duplicateOfRegistrationId, duplicatePaymentAt = :duplicatePaymentAt, #status = :ok, statusAt = :duplicatePaymentAt REMOVE paymentResponse',
          }),
        },
        registrationItem,
      ])
    })

    it('writes a transaction the callback found missing whole, as a duplicate, with its registration', async () => {
      mockDocumentTransaction.mockResolvedValueOnce(undefined)

      await expect(recordDuplicatePayment(payment, 'event-1', 'registration-1', duplicate, false)).resolves.toEqual({
        recorded: true,
      })
      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Put: {
            ConditionExpression: 'attribute_not_exists(transactionId)',
            Item: {
              ...payment,
              duplicateOfRegistrationId: 'registration-0',
              duplicatePaymentAt: NOW,
              paymentResponse: undefined,
              provider: 'nordea',
              status: 'ok',
              statusAt: NOW,
            },
            TableName: 'transaction-table',
          },
        },
        registrationItem,
      ])
    })

    it.each([
      ['already a duplicate', { duplicatePaymentAt: '2026-10-19T11:00:00.000Z' }],
      ['already applied', { registrationAppliedAt: '2026-10-19T11:00:00.000Z' }],
    ])('answers not recorded when a consistent read finds the transaction %s', async (_, settled) => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      mockDocumentTransaction.mockRejectedValueOnce(namedError('TransactionCanceledException'))
      mockRead.mockResolvedValueOnce({ ...payment, ...settled })

      await expect(recordDuplicatePayment(payment, 'event-1', 'registration-1', duplicate)).resolves.toEqual({
        recorded: false,
      })
      expect(mockRead).toHaveBeenCalledWith({ transactionId: 'transaction-1' }, undefined, true)
      expect(loggedLines(infoSpy)).toContainEqual(
        expect.objectContaining({
          message: 'transaction was already settled on its registration',
          transactionId: 'transaction-1',
        })
      )
      infoSpy.mockRestore()
    })

    it.each([
      ['still open', payment],
      ['failed earlier, with neither outcome written', { ...payment, status: 'fail' }],
    ])('rethrows a refused transaction the consistent read finds %s', async (_, current) => {
      const error = namedError('TransactionCanceledException')
      mockDocumentTransaction.mockRejectedValueOnce(error)
      mockRead.mockResolvedValueOnce(current)

      await expect(recordDuplicatePayment(payment, 'event-1', 'registration-1', duplicate)).rejects.toBe(error)
    })

    it('rethrows any other failure without reading the transaction', async () => {
      const error = namedError('ProvisionedThroughputExceededException')
      mockDocumentTransaction.mockRejectedValueOnce(error)

      await expect(recordDuplicatePayment(payment, 'event-1', 'registration-1', duplicate)).rejects.toBe(error)
      expect(mockRead).not.toHaveBeenCalled()
    })
  })

  describe('applySuccessfulPayment', () => {
    it('applies a stored payment to its registration in one transaction', async () => {
      mockDocumentTransaction.mockResolvedValueOnce(undefined)

      await expect(
        applySuccessfulPayment(payment, 'event-1', 'registration-1', 'nordea', true, true, 20)
      ).resolves.toEqual({ applied: true, appliedAt: NOW })
      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Update: {
            // Only "not settled yet": money that arrived is money, even for a payment this app had
            // already failed, so not the unresolved condition (KOE-1529). A payment recorded as a
            // duplicate waits for its refund and is never applied on top (KOE-1531).
            ConditionExpression:
              'attribute_exists(transactionId) AND attribute_not_exists(registrationAppliedAt) AND attribute_not_exists(duplicatePaymentAt)',
            ExpressionAttributeNames: { '#provider': 'provider', '#status': 'status' },
            ExpressionAttributeValues: {
              ':appliedAt': NOW,
              ':ok': 'ok',
              ':provider': 'nordea',
              ':receiptPreviouslyPaid': 20,
              ':receiptTotalPaid': 70,
            },
            Key: { transactionId: 'transaction-1' },
            TableName: 'transaction-table',
            UpdateExpression:
              'SET #status = :ok, statusAt = :appliedAt, registrationAppliedAt = :appliedAt, receiptPreviouslyPaid = :receiptPreviouslyPaid, receiptTotalPaid = :receiptTotalPaid, #provider = :provider REMOVE paymentResponse',
          },
        },
        {
          Update: {
            ConditionExpression: 'attribute_exists(id)',
            ExpressionAttributeNames: { '#state': 'state' },
            ExpressionAttributeValues: {
              ':amount': 50,
              ':appliedAt': NOW,
              ':confirmed': true,
              ':paymentStatus': 'SUCCESS',
              ':ready': 'ready',
              ':transactionId': new Set(['transaction-1']),
            },
            Key: { eventId: 'event-1', id: 'registration-1' },
            TableName: 'registration-table',
            UpdateExpression:
              'SET confirmed = :confirmed, paidAt = :appliedAt, paymentStatus = :paymentStatus, #state = :ready, updatedAt = :appliedAt REMOVE paymentCreationAt, paymentCreationStamp ADD paidAmount :amount DELETE openPayments :transactionId',
          },
        },
      ])
    })

    it('writes a payment the callback found missing whole, applied', async () => {
      mockDocumentTransaction.mockResolvedValueOnce(undefined)

      await expect(
        applySuccessfulPayment(payment, 'event-1', 'registration-1', undefined, false, false)
      ).resolves.toEqual({ applied: true, appliedAt: NOW })
      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Put: {
            ConditionExpression: 'attribute_not_exists(transactionId)',
            Item: {
              ...payment,
              paymentResponse: undefined,
              provider: undefined,
              receiptPreviouslyPaid: 0,
              receiptTotalPaid: 50,
              registrationAppliedAt: NOW,
              status: 'ok',
              statusAt: NOW,
            },
            TableName: 'transaction-table',
          },
        },
        {
          Update: {
            ConditionExpression: 'attribute_exists(id)',
            ExpressionAttributeNames: { '#state': 'state' },
            ExpressionAttributeValues: {
              ':amount': 50,
              ':appliedAt': NOW,
              ':paymentStatus': 'SUCCESS',
              ':ready': 'ready',
              ':transactionId': new Set(['transaction-1']),
            },
            Key: { eventId: 'event-1', id: 'registration-1' },
            TableName: 'registration-table',
            UpdateExpression:
              'SET paidAt = :appliedAt, paymentStatus = :paymentStatus, #state = :ready, updatedAt = :appliedAt REMOVE paymentCreationAt, paymentCreationStamp ADD paidAmount :amount DELETE openPayments :transactionId',
          },
        },
      ])
    })

    it.each([
      ['applied', { registrationAppliedAt: '2026-10-19T11:00:00.000Z' }],
      ['recorded as a duplicate', { duplicatePaymentAt: '2026-10-19T11:00:00.000Z' }],
    ])('answers a refused transaction not applied once a consistent read finds it %s', async (_, settled) => {
      mockDocumentTransaction.mockRejectedValueOnce(namedError('TransactionCanceledException'))
      mockRead.mockResolvedValueOnce({ ...payment, ...settled })

      await expect(applySuccessfulPayment(payment, 'event-1', 'registration-1', undefined, false)).resolves.toEqual({
        applied: false,
        appliedAt: NOW,
      })
      expect(mockRead).toHaveBeenCalledWith({ transactionId: 'transaction-1' }, undefined, true)
    })

    it.each([
      ['still open', payment],
      // A failure is not an outcome on the registration: money that arrived after it is applied, and a
      // refusal for some other reason must not pass as a retry (KOE-1531).
      ['failed earlier, with neither outcome written', { ...payment, status: 'fail' }],
    ])('rethrows a refused transaction the consistent read finds %s', async (_, current) => {
      const error = namedError('TransactionCanceledException')
      mockDocumentTransaction.mockRejectedValueOnce(error)
      mockRead.mockResolvedValueOnce(current)

      await expect(applySuccessfulPayment(payment, 'event-1', 'registration-1', undefined, false)).rejects.toBe(error)
    })

    it('rethrows any other failure without reading the transaction', async () => {
      const error = namedError('ProvisionedThroughputExceededException')
      mockDocumentTransaction.mockRejectedValueOnce(error)

      await expect(applySuccessfulPayment(payment, 'event-1', 'registration-1', undefined, false)).rejects.toBe(error)
      expect(mockRead).not.toHaveBeenCalled()
    })
  })

  describe('applySuccessfulRefund', () => {
    it('applies a stored refund to its registration in one transaction', async () => {
      mockDocumentTransaction.mockResolvedValueOnce(undefined)

      await expect(applySuccessfulRefund(refund, 'event-1', 'registration-1')).resolves.toEqual({
        applied: true,
        appliedAt: NOW,
      })
      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Update: {
            ConditionExpression: 'attribute_exists(transactionId) AND attribute_not_exists(registrationAppliedAt)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':appliedAt': NOW, ':ok': 'ok' },
            Key: { transactionId: 'refund-1' },
            TableName: 'transaction-table',
            UpdateExpression:
              'SET #status = :ok, statusAt = :appliedAt, registrationAppliedAt = :appliedAt REMOVE paymentResponse',
          },
        },
        {
          Update: {
            ConditionExpression: 'attribute_exists(id)',
            ExpressionAttributeValues: {
              ':amount': 10,
              ':appliedAt': NOW,
              ':handlingCost': 2.5,
              ':refundStatus': 'SUCCESS',
              ':transactionId': new Set(['refund-1']),
            },
            Key: { eventId: 'event-1', id: 'registration-1' },
            TableName: 'registration-table',
            UpdateExpression:
              'SET refundAt = :appliedAt, refundStatus = :refundStatus, updatedAt = :appliedAt REMOVE refundCreationAt, refundCreationStamp ADD refundAmount :amount, refundHandlingCost :handlingCost DELETE openRefunds :transactionId',
          },
        },
      ])
    })

    it('writes a refund the callback found missing whole, applied, without a handling cost', async () => {
      mockDocumentTransaction.mockResolvedValueOnce(undefined)
      const withoutCost = { ...refund, handlingCost: undefined }

      await applySuccessfulRefund(withoutCost, 'event-1', 'registration-1', false)

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Put: {
            ConditionExpression: 'attribute_not_exists(transactionId)',
            Item: { ...withoutCost, registrationAppliedAt: NOW, status: 'ok', statusAt: NOW },
            TableName: 'transaction-table',
          },
        },
        {
          Update: expect.objectContaining({
            ExpressionAttributeValues: expect.objectContaining({ ':handlingCost': 0 }),
            Key: { eventId: 'event-1', id: 'registration-1' },
            TableName: 'registration-table',
          }),
        },
      ])
    })

    it('answers an already applied refund as not applied, and logs it', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      mockDocumentTransaction.mockRejectedValueOnce(namedError('TransactionCanceledException'))
      mockRead.mockResolvedValueOnce({ ...refund, registrationAppliedAt: '2026-10-19T11:00:00.000Z' })

      await expect(applySuccessfulRefund(refund, 'event-1', 'registration-1')).resolves.toEqual({
        applied: false,
        appliedAt: NOW,
      })
      expect(loggedLines(infoSpy)).toContainEqual(
        expect.objectContaining({
          message: 'transaction was already settled on its registration',
          transactionId: 'refund-1',
        })
      )
      infoSpy.mockRestore()
    })
  })

  describe('the post-payment lease', () => {
    const leaseCondition = {
      expression:
        'attribute_exists(#transactionId) AND (attribute_not_exists(#postPaymentLease) OR #postPaymentLease.#expiresAt < :now)',
      names: { '#expiresAt': 'expiresAt', '#postPaymentLease': 'postPaymentLease', '#transactionId': 'transactionId' },
      values: { ':now': Date.parse(NOW) },
    }
    const tokenCondition = (token: string) => ({
      expression: '#postPaymentLease.#token = :token',
      names: { '#postPaymentLease': 'postPaymentLease', '#token': 'token' },
      values: { ':token': token },
    })

    it('leases the transaction for 90 seconds and answers it as stored once leased', async () => {
      mockUpdate.mockResolvedValue({})
      mockRead.mockResolvedValueOnce(payment)

      const claim = await claimPostPaymentWorkflow('transaction-1')

      expect(claim).toEqual({ release: expect.any(Function), token: expect.any(String), transaction: payment })
      const token = claim?.token ?? ''
      expect(mockUpdate).toHaveBeenCalledWith(
        { transactionId: 'transaction-1' },
        { set: { postPaymentLease: { expiresAt: Date.parse(NOW) + 90_000, token } } },
        'transaction-table',
        undefined,
        leaseCondition
      )
      expect(mockRead).toHaveBeenCalledWith({ transactionId: 'transaction-1' }, 'transaction-table', true)

      await markPostPaymentPhase('transaction-1', token, 'receiptSentAt')
      expect(mockUpdate).toHaveBeenCalledWith(
        { transactionId: 'transaction-1' },
        { set: { receiptSentAt: NOW } },
        'transaction-table',
        undefined,
        tokenCondition(token)
      )

      await claim?.release()
      expect(mockUpdate).toHaveBeenLastCalledWith(
        { transactionId: 'transaction-1' },
        { remove: ['postPaymentLease'] },
        'transaction-table',
        undefined,
        tokenCondition(token)
      )
    })

    it('answers undefined while another callback holds the lease', async () => {
      mockUpdate.mockRejectedValueOnce(namedError('ConditionalCheckFailedException'))

      await expect(claimPostPaymentWorkflow('transaction-1')).resolves.toBeUndefined()
      expect(mockRead).not.toHaveBeenCalled()
    })
  })
})
