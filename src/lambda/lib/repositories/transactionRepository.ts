import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb'
import type { JsonPaymentTransaction, JsonRefundTransaction, JsonTransaction } from '../../../types'
import type { UpdateActions } from '../../utils/CustomDynamoClient'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { isConditionalCheckFailure, isTransactionCanceled } from '../api-gw'
import { createDynamoLease } from '../lease'
import { logger } from '../log'
import { registrationUpdateItem } from './registrationRepository'

const { transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

type TransactionItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number]

/**
 * The transaction as stored, or undefined when there is none. The id a provider's callback names is
 * taken as it comes; the callback's signature check has already required it.
 */
export const readTransaction = async <T extends JsonTransaction = JsonTransaction>(transactionId: string | undefined) =>
  dynamoDB.read<T>({ transactionId })

/** Every payment and refund of one registration (`eventId:registrationId`). */
export const readTransactionsByReference = async (reference: string) =>
  dynamoDB.query<JsonPaymentTransaction | JsonRefundTransaction>({
    index: 'gsiReference',
    key: '#reference = :reference',
    names: {
      '#reference': 'reference',
    },
    values: { ':reference': reference },
  })

/** The payments of these ids, in one batch. */
export const readPaymentTransactions = async (transactionIds: string[]) =>
  dynamoDB.batchGet<JsonPaymentTransaction>(transactionIds.map((transactionId) => ({ transactionId })))

const putNewTransaction = (transaction: JsonTransaction): TransactionItem => ({
  Put: {
    ConditionExpression: 'attribute_not_exists(transactionId)',
    Item: transaction,
    TableName: transactionTable,
  },
})

/** Stores a new payment and opens it on its registration, in one transaction. */
export const createPaymentTransaction = async (
  transaction: JsonPaymentTransaction,
  eventId: string,
  registrationId: string,
  updatedAt: string
) => {
  await dynamoDB.documentTransaction([
    putNewTransaction(transaction),
    registrationUpdateItem(eventId, registrationId, {
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeValues: { ':transactionId': new Set([transaction.transactionId]), ':updatedAt': updatedAt },
      UpdateExpression:
        'SET updatedAt = :updatedAt REMOVE paymentCreationAt, paymentCreationStamp ADD openPayments :transactionId',
    }),
  ])
}

/** Stores a new refund and opens it on its registration with the given update, in one transaction. */
const createRefund = async (
  transaction: JsonRefundTransaction,
  eventId: string,
  registrationId: string,
  registrationUpdate: Omit<Parameters<typeof registrationUpdateItem>[2], 'ConditionExpression'>
) => {
  await dynamoDB.documentTransaction([
    putNewTransaction(transaction),
    registrationUpdateItem(eventId, registrationId, {
      ConditionExpression: 'attribute_exists(id)',
      ...registrationUpdate,
    }),
  ])
}

/**
 * Stores a refund that is still pending and opens it on its registration. Its `refundStatus` is
 * written only once it is applied (`applySuccessfulRefund`).
 */
export const createPendingRefundTransaction = async (
  transaction: JsonRefundTransaction,
  eventId: string,
  registrationId: string,
  updatedAt: string
) =>
  createRefund(transaction, eventId, registrationId, {
    ExpressionAttributeValues: { ':transactionId': new Set([transaction.transactionId]), ':updatedAt': updatedAt },
    UpdateExpression:
      'SET updatedAt = :updatedAt REMOVE refundCreationAt, refundCreationStamp ADD openRefunds :transactionId',
  })

/** Stores a refund that is already settled, opens it and marks its registration refunded, in one transaction. */
export const createSettledRefundTransaction = async (
  transaction: JsonRefundTransaction,
  eventId: string,
  registrationId: string,
  updatedAt: string
) =>
  createRefund(transaction, eventId, registrationId, {
    ExpressionAttributeNames: { '#status': 'refundStatus' },
    ExpressionAttributeValues: {
      ':status': 'SUCCESS',
      ':transactionId': new Set([transaction.transactionId]),
      ':updatedAt': updatedAt,
    },
    UpdateExpression:
      'SET #status = :status, updatedAt = :updatedAt REMOVE refundCreationAt, refundCreationStamp ADD openRefunds :transactionId',
  })

/** `isTransactionSettled` in DynamoDB's own syntax: every writer that must never write over a
 * settled transaction is conditioned on it (KOE-1529). */
const UNRESOLVED_CONDITION = {
  expression:
    'attribute_not_exists(registrationAppliedAt) AND attribute_not_exists(duplicatePaymentAt) AND #status <> :fail',
  names: { '#status': 'status' },
  values: { ':fail': 'fail' },
}

/**
 * Writes the update on a still-unresolved transaction only: false when the transaction was settled.
 * The status writes that are never a failure go through this (`updateTransactionStatus`).
 */
export const updateUnresolvedTransaction = async (transactionId: string, actions: UpdateActions): Promise<boolean> => {
  try {
    await dynamoDB.update({ transactionId }, actions, undefined, undefined, UNRESOLVED_CONDITION)
    return true
  } catch (error) {
    if (isConditionalCheckFailure(error)) return false
    throw error
  }
}

/**
 * Only a still-unresolved transaction becomes `fail`. Answers whether this call was the one that
 * moved it, which is what gates the audit row (KOE-1529).
 */
export const failUnfinishedTransaction = async (
  transactionId: string,
  provider?: string,
  statusAt: string = new Date().toISOString()
): Promise<boolean> =>
  updateUnresolvedTransaction(transactionId, {
    remove: ['paymentResponse'],
    set: { status: 'fail', statusAt, ...(provider ? { provider } : {}) },
  })

interface DuplicatePayment {
  duplicateOfRegistrationId: string
  duplicatePaymentAt: string
  provider: string | undefined
}

/**
 * Whether the transaction's outcome is already on its registration: applied, or recorded as a
 * duplicate. Narrower than `isTransactionSettled`: a `fail` status is not an outcome on the
 * registration, so a refusal on a failed transaction is not taken for a retry (KOE-1531).
 */
const transactionWasAlreadySettled = async (transactionId: string) => {
  const current = await dynamoDB.read<JsonTransaction>({ transactionId }, undefined, true)
  return Boolean(current?.registrationAppliedAt ?? current?.duplicatePaymentAt)
}

/** The transaction and its registration in one write. False when a retry finds it already settled. */
const runRegistrationTransaction = async (transactionId: string, items: TransactionItem[]) => {
  try {
    await dynamoDB.documentTransaction(items)
    return true
  } catch (error) {
    if (isTransactionCanceled(error) && (await transactionWasAlreadySettled(transactionId))) {
      logger.info('transaction was already settled on its registration', { transactionId })
      return false
    }
    throw error
  }
}

/** Adds the provider that captured the payment to a transaction's SET, when there is one. */
const setProvider = (
  provider: string | undefined,
  set: string[],
  names: Record<string, string>,
  values: Record<string, unknown>
) => {
  if (!provider) return
  set.push('#provider = :provider')
  names['#provider'] = 'provider'
  values[':provider'] = provider
}

/** A stored payment's condition for either outcome: it is there, and neither outcome is written yet. */
const UNSETTLED_PAYMENT_CONDITION =
  'attribute_exists(transactionId) AND attribute_not_exists(registrationAppliedAt) AND attribute_not_exists(duplicatePaymentAt)'

/**
 * Records a payment as a duplicate of another registration's, in one transaction: the transaction
 * becomes `ok` and is kept for a refund, and its registration's payment reads DUPLICATE with the
 * transaction out of its open payments. A transaction the success callback found missing is written
 * whole. As for `applySuccessfulPayment`, the condition is only that neither outcome is written yet,
 * so a payment this app had failed is still recorded (KOE-1529). Answers `recorded: false` when a
 * retry finds the outcome already written.
 */
export const recordDuplicatePayment = async (
  transaction: JsonTransaction,
  eventId: string,
  registrationId: string,
  { duplicateOfRegistrationId, duplicatePaymentAt, provider }: DuplicatePayment,
  transactionExists = true
) => {
  const transactionNames: Record<string, string> = { '#status': 'status' }
  const transactionValues: Record<string, unknown> = {
    ':duplicateOfRegistrationId': duplicateOfRegistrationId,
    ':duplicatePaymentAt': duplicatePaymentAt,
    ':ok': 'ok',
  }
  const transactionSet = [
    'duplicateOfRegistrationId = :duplicateOfRegistrationId',
    'duplicatePaymentAt = :duplicatePaymentAt',
    '#status = :ok',
    'statusAt = :duplicatePaymentAt',
  ]
  setProvider(provider, transactionSet, transactionNames, transactionValues)

  const transactionOperation: TransactionItem = transactionExists
    ? {
        Update: {
          ConditionExpression: UNSETTLED_PAYMENT_CONDITION,
          ExpressionAttributeNames: transactionNames,
          ExpressionAttributeValues: transactionValues,
          Key: { transactionId: transaction.transactionId },
          TableName: transactionTable,
          UpdateExpression: `SET ${transactionSet.join(', ')} REMOVE paymentResponse`,
        },
      }
    : {
        Put: {
          ConditionExpression: 'attribute_not_exists(transactionId)',
          Item: {
            ...transaction,
            duplicateOfRegistrationId,
            duplicatePaymentAt,
            paymentResponse: undefined,
            ...(provider ? { provider } : {}),
            status: 'ok',
            statusAt: duplicatePaymentAt,
          },
          TableName: transactionTable,
        },
      }

  const recorded = await runRegistrationTransaction(transaction.transactionId, [
    transactionOperation,
    registrationUpdateItem(eventId, registrationId, {
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeValues: {
        ':duplicate': 'DUPLICATE',
        ':duplicatePaymentAt': duplicatePaymentAt,
        // DynamoDB's set-difference action; this transaction is no longer open (KOE-1529).
        ':transactionId': new Set([transaction.transactionId]),
      },
      UpdateExpression:
        'SET paymentStatus = :duplicate, updatedAt = :duplicatePaymentAt DELETE openPayments :transactionId',
    }),
  ])

  return { recorded }
}

/**
 * Applies a successful payment: the transaction becomes `ok` and applied, and the registration paid,
 * in one transaction. A transaction the success callback found missing is written whole. The
 * transaction's condition is only that neither outcome is written yet, not the "unresolved" one:
 * money that arrived is money, even for a payment this app had already failed (KOE-1529). A payment
 * recorded as a duplicate waits for its refund and is never applied on top of it (KOE-1531).
 */
export const applySuccessfulPayment = async (
  transaction: JsonTransaction,
  eventId: string,
  registrationId: string,
  provider: string | undefined,
  confirmed: boolean,
  transactionExists = true,
  previouslyPaid = 0
) => {
  const appliedAt = new Date().toISOString()
  const transactionNames: Record<string, string> = { '#status': 'status' }
  const transactionValues: Record<string, unknown> = {
    ':appliedAt': appliedAt,
    ':ok': 'ok',
    ':receiptPreviouslyPaid': previouslyPaid,
    ':receiptTotalPaid': previouslyPaid + transaction.amount / 100,
  }
  const transactionSet = [
    '#status = :ok',
    'statusAt = :appliedAt',
    'registrationAppliedAt = :appliedAt',
    'receiptPreviouslyPaid = :receiptPreviouslyPaid',
    'receiptTotalPaid = :receiptTotalPaid',
  ]
  setProvider(provider, transactionSet, transactionNames, transactionValues)

  const transactionOperation = transactionExists
    ? {
        Update: {
          ConditionExpression: UNSETTLED_PAYMENT_CONDITION,
          ExpressionAttributeNames: transactionNames,
          ExpressionAttributeValues: transactionValues,
          Key: { transactionId: transaction.transactionId },
          TableName: transactionTable,
          UpdateExpression: `SET ${transactionSet.join(', ')} REMOVE paymentResponse`,
        },
      }
    : {
        Put: {
          ConditionExpression: 'attribute_not_exists(transactionId)',
          Item: {
            ...transaction,
            paymentResponse: undefined,
            provider,
            receiptPreviouslyPaid: previouslyPaid,
            receiptTotalPaid: previouslyPaid + transaction.amount / 100,
            registrationAppliedAt: appliedAt,
            status: 'ok',
            statusAt: appliedAt,
          },
          TableName: transactionTable,
        },
      }

  const registrationValues: Record<string, unknown> = {
    ':amount': transaction.amount / 100,
    ':appliedAt': appliedAt,
    ':paymentStatus': 'SUCCESS',
    ':ready': 'ready',
    // DynamoDB's set-difference action; this transaction is no longer open (KOE-1529).
    ':transactionId': new Set([transaction.transactionId]),
  }
  const registrationSet = [
    'paidAt = :appliedAt',
    'paymentStatus = :paymentStatus',
    '#state = :ready',
    'updatedAt = :appliedAt',
  ]
  if (confirmed) {
    registrationSet.unshift('confirmed = :confirmed')
    registrationValues[':confirmed'] = true
  }

  const applied = await runRegistrationTransaction(transaction.transactionId, [
    transactionOperation,
    registrationUpdateItem(eventId, registrationId, {
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: { '#state': 'state' },
      ExpressionAttributeValues: registrationValues,
      UpdateExpression: `SET ${registrationSet.join(', ')} REMOVE paymentCreationAt, paymentCreationStamp ADD paidAmount :amount DELETE openPayments :transactionId`,
    }),
  ])

  return { applied, appliedAt }
}

/** Applies a successful refund to its transaction and its registration, in one transaction. */
export const applySuccessfulRefund = async (
  transaction: JsonRefundTransaction,
  eventId: string,
  registrationId: string,
  transactionExists = true
) => {
  const appliedAt = new Date().toISOString()
  const transactionOperation = transactionExists
    ? {
        Update: {
          ConditionExpression: 'attribute_exists(transactionId) AND attribute_not_exists(registrationAppliedAt)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':appliedAt': appliedAt, ':ok': 'ok' },
          Key: { transactionId: transaction.transactionId },
          TableName: transactionTable,
          UpdateExpression:
            'SET #status = :ok, statusAt = :appliedAt, registrationAppliedAt = :appliedAt REMOVE paymentResponse',
        },
      }
    : {
        Put: {
          ConditionExpression: 'attribute_not_exists(transactionId)',
          Item: { ...transaction, registrationAppliedAt: appliedAt, status: 'ok', statusAt: appliedAt },
          TableName: transactionTable,
        },
      }
  const applied = await runRegistrationTransaction(transaction.transactionId, [
    transactionOperation,
    registrationUpdateItem(eventId, registrationId, {
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeValues: {
        ':amount': transaction.amount / 100,
        ':appliedAt': appliedAt,
        ':handlingCost': (transaction.handlingCost ?? 0) / 100,
        ':refundStatus': 'SUCCESS',
        // DynamoDB's set-difference action; this transaction is no longer open (KOE-1529).
        ':transactionId': new Set([transaction.transactionId]),
      },
      UpdateExpression:
        'SET refundAt = :appliedAt, refundStatus = :refundStatus, updatedAt = :appliedAt REMOVE refundCreationAt, refundCreationStamp ADD refundAmount :amount, refundHandlingCost :handlingCost DELETE openRefunds :transactionId',
    }),
  ])

  return { applied, appliedAt }
}

/** The steps after a payment that must each run once, however many callbacks arrive. */
type PostPaymentPhase =
  | 'confirmationSentAt'
  | 'invitationSentAt'
  | 'paymentAuditAt'
  | 'postPaymentProcessedAt'
  | 'postPaymentPublishedAt'
  | 'receiptSentAt'

const POST_PAYMENT_LEASE_DURATION_MS = 90 * 1000

// Built where it is used, not at import: the lease holds no state of its own, and a lease built at
// import would count, for the policy check (lambdaTableUse), as reaching this table from every
// lambda that imports this module, while only PaymentSuccess does.
const postPaymentLease = () =>
  createDynamoLease<JsonTransaction, PostPaymentPhase>({
    client: dynamoDB,
    durationMs: POST_PAYMENT_LEASE_DURATION_MS,
    itemExistsField: 'transactionId',
    leaseField: 'postPaymentLease',
    table: transactionTable,
  })

/**
 * Leases the payment's post-payment work to this callback. Undefined while another callback holds
 * it; otherwise the transaction as stored once leased, its phase markers included.
 */
export const claimPostPaymentWorkflow = async (transactionId: string) => {
  const claim = await postPaymentLease().claim({
    key: { transactionId },
    missingItemMessage: `Transaction '${transactionId}' disappeared while claiming post-payment workflow`,
  })
  if (!claim) return undefined

  return { release: claim.release, token: claim.token, transaction: claim.item }
}

/** Marks a post-payment phase done, as long as this callback still holds the lease. */
export const markPostPaymentPhase = (transactionId: string, token: string, field: PostPaymentPhase) =>
  postPaymentLease().markPhase({ transactionId }, token, field)
