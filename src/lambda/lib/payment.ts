import type { AuditActor, AuditMessage } from '../../lib/audit'
import type {
  DogEvent,
  JsonConfirmedEvent,
  JsonDogEvent,
  JsonPaymentTransaction,
  JsonRefundTransaction,
  JsonRegistration,
  JsonTransaction,
  Language,
  Patch,
} from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import type { PaytrailError } from './paytrail'
import { getFixedT } from '../../i18n/lambda'
import { auditUser, paymentAudit, refundPaytrailFailedAudit } from '../../lib/audit'
import { localizedEventName } from '../../lib/event'
import { formatMoney } from '../../lib/money'
import { getProviderName, isPaymentInProgress, paytrailErrorText, transactionActor } from '../../lib/payment'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { audit, registrationAuditKey } from './audit'
import { getEvent } from './event'
import { LambdaError } from './lambda'
import { logger } from './log'
import { paytrail } from './paytrail'
import { getRegistration, participantRegistrationResponse } from './registration'
import { buildParticipantPaymentPatch } from './ws/payloads'

const { registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

type CreationType = 'payment' | 'refund'
type TransactionClient = Pick<CustomDynamoClient, 'documentTransaction'>

const creationFields = (type: CreationType) => ({
  at: `${type}CreationAt`,
  stamp: `${type}CreationStamp`,
})

export const claimTransactionCreation = async (
  client: TransactionClient,
  type: CreationType,
  eventId: string,
  registrationId: string,
  stamp: string,
  staleAgeMs: number
) => {
  const fields = creationFields(type)
  const creationAt = new Date().toISOString()
  const creationAtValue = `:${fields.at}`

  try {
    await client.documentTransaction([
      {
        Update: {
          ConditionExpression: `attribute_not_exists(${fields.at}) OR ${fields.at} < :staleBefore`,
          ExpressionAttributeValues: {
            [creationAtValue]: creationAt,
            ':staleBefore': new Date(Date.now() - staleAgeMs).toISOString(),
            ':stamp': stamp,
          },
          Key: { eventId, id: registrationId },
          TableName: registrationTable,
          UpdateExpression: `SET ${fields.at} = ${creationAtValue}, ${fields.stamp} = :stamp`,
        },
      },
    ])
    return true
  } catch (error) {
    if ((error as Error).name === 'TransactionCanceledException') return false
    throw error
  }
}

export const releaseTransactionCreation = async (
  client: TransactionClient,
  type: CreationType,
  eventId: string,
  registrationId: string,
  stamp: string
) => {
  const fields = creationFields(type)

  try {
    await client.documentTransaction([
      {
        Update: {
          ConditionExpression: `${fields.stamp} = :stamp`,
          ExpressionAttributeValues: { ':stamp': stamp },
          Key: { eventId, id: registrationId },
          TableName: registrationTable,
          UpdateExpression: `REMOVE ${fields.at}, ${fields.stamp}`,
        },
      },
    ])
  } catch (error) {
    logger.error('failed to release creation claim', { error, registrationId, type })
  }
}

/** A refund Paytrail refused, for the registration's trail. */
export const refundPaytrailErrorAudit = (error: PaytrailError) =>
  refundPaytrailFailedAudit(error.status, paytrailErrorText(error.error))

/**
 * A registration whose payment or refund was settled as failed, for whoever sends it on. The domain
 * writes the row and says what changed; broadcasting is the handler's job (KOE-1340, KOE-1529).
 */
export interface CancelledRegistration {
  eventId: string
  organizerId: string
  /**
   * What the participant's page reads: the payment state of the settled row, built as PaymentSuccess
   * builds its patch, so the pay offer comes back once nothing is open any more (KOE-1526, KOE-1529).
   */
  participantPatch: Patch<JsonRegistration>
  patch: Patch<JsonRegistration> & { eventId: string; id: string }
  registrationId: string
}

/** The registration field a settled transaction's id is dropped from. */
type OpenSetField = 'openPayments' | 'openRefunds'

/**
 * True once the app itself has disposed of the transaction: applied it, marked it a duplicate, or
 * already failed it. Paytrail's own word `ok` is never enough on its own -- an email refund answers
 * `ok` while the refund is still pending the customer's bank account (KOE-1529).
 */
export const isTransactionSettled = (
  transaction: Pick<JsonTransaction, 'registrationAppliedAt' | 'duplicatePaymentAt' | 'status'>
): boolean =>
  Boolean(transaction.registrationAppliedAt) || Boolean(transaction.duplicatePaymentAt) || transaction.status === 'fail'

/** The condition `isTransactionSettled` expresses in DynamoDB's own syntax, shared by every writer
 * that must never write over a settled transaction (KOE-1529). */
const UNRESOLVED_CONDITION = {
  expression:
    'attribute_not_exists(registrationAppliedAt) AND attribute_not_exists(duplicatePaymentAt) AND #status <> :fail',
  names: { '#status': 'status' },
  values: { ':fail': 'fail' },
}

const isConditionalCheckFailed = (error: unknown): boolean =>
  error instanceof Error && error.name === 'ConditionalCheckFailedException'

/**
 * Conditional write on the transaction row: only a still-unresolved transaction becomes `fail`.
 * Returns whether this call was the one that moved it, which is what gates the audit row (KOE-1529).
 */
export const failUnfinishedTransaction = async (
  transaction: JsonTransaction,
  provider?: string,
  statusAt: string = new Date().toISOString()
): Promise<boolean> => {
  try {
    await dynamoDB.update(
      { transactionId: transaction.transactionId },
      {
        remove: ['paymentResponse'],
        set: { status: 'fail', statusAt, ...(provider ? { provider } : {}) },
      },
      transactionTable,
      undefined,
      UNRESOLVED_CONDITION
    )
    return true
  } catch (error) {
    if (isConditionalCheckFailed(error)) return false
    throw error
  }
}

/**
 * Removes the transaction id from the registration's open set, unconditionally and repeatably: a
 * retry after a crash between this write and `failUnfinishedTransaction`'s still finishes (KOE-1529).
 * Bumps `updatedAt` in the same write -- the secretary's incremental refresh
 * (`changedItemsSince`) filters on it, so a row whose only open attempt just failed must not look
 * unchanged after a websocket gap. Returns whether the id was actually a member before the removal
 * -- the signal for whether anything needs to be published, since an old or repeated call that finds
 * the id already gone changes nothing.
 */
export const dropOpenTransaction = async (
  registration: Pick<JsonRegistration, 'eventId' | 'id'>,
  field: OpenSetField,
  transactionId: string,
  updatedAt: string = new Date().toISOString()
): Promise<boolean> => {
  const result = await dynamoDB.update(
    { eventId: registration.eventId, id: registration.id },
    { delete: { [field]: new Set([transactionId]) }, set: { updatedAt } },
    registrationTable,
    'UPDATED_OLD'
  )
  const before: string[] | undefined = result.Attributes?.[field]
  return before?.includes(transactionId) ?? false
}

interface SettledTransaction {
  /** Whether this call's conditional write was the one that moved the transaction to `fail`. */
  moved: boolean
  /** Whether this call's removal actually found the id still in the open set. */
  changed: boolean
  /** Only set when `changed`: what to publish, built from a fresh, strongly consistent read. */
  cancelled?: CancelledRegistration
}

interface SettleFailedTransactionAudit {
  provider?: string
  auditMessage: (transaction: JsonTransaction, provider: string | undefined) => AuditMessage
  auditActor: (transaction: JsonTransaction) => AuditActor
}

/**
 * The one step every writer that can fail a payment or refund settles through, however many of them
 * reach the same transaction (KOE-1529). Order matters: the transaction is written first, so an
 * interrupted call leaves it `fail` with its id still open, which the next retry (or PaymentCreate
 * refusing to reuse it) still resolves correctly; the registration's open set is dropped
 * unconditionally second, so a repeat of either write changes nothing further. The audit row is
 * written only by the call whose own write moved the transaction (so two racing callbacks on the same
 * transaction write exactly one), and a patch is only built -- from a fresh, strongly consistent
 * re-read, never the row this call started with -- when this call's removal actually found the id
 * open, so only the call that changed something publishes.
 */
export const settleFailedTransaction = async (
  transaction: JsonTransaction,
  registration: JsonRegistration,
  field: OpenSetField,
  options: SettleFailedTransactionAudit
): Promise<SettledTransaction> => {
  // Shared between the transaction's own statusAt and the registration's updatedAt: one failure is
  // one moment, and the incremental refresh reading updatedAt should see it as of that moment.
  const now = new Date().toISOString()
  const moved = await failUnfinishedTransaction(transaction, options.provider, now)
  const changed = await dropOpenTransaction(registration, field, transaction.transactionId, now)

  if (moved) {
    await audit({
      auditKey: registrationAuditKey(registration),
      ...options.auditMessage(transaction, options.provider),
      ...auditUser(options.auditActor(transaction)),
    })
  }

  if (!changed) return { changed, moved }

  // Strongly consistent: another writer (recordDuplicatePayment, say) may be between its own two
  // writes right now, and the patch must say what the row holds now, not what it held when this call
  // started (KOE-1529).
  const updatedRegistration = await dynamoDB.read<JsonRegistration>(
    { eventId: registration.eventId, id: registration.id },
    registrationTable,
    true
  )
  if (!updatedRegistration) return { changed, moved }

  const confirmedEvent = await getEvent<JsonConfirmedEvent>(registration.eventId)
  return {
    cancelled: {
      eventId: registration.eventId,
      organizerId: confirmedEvent.organizer.id,
      participantPatch: await participantPaymentPatch(updatedRegistration, confirmedEvent),
      patch: {
        [field]: updatedRegistration[field],
        eventId: registration.eventId,
        id: registration.id,
        updatedAt: updatedRegistration.updatedAt,
      },
      registrationId: registration.id,
    },
    changed,
    moved,
  }
}

export const parseParams = (params: Partial<PaytrailCallbackParams>) => {
  const [eventId, registrationId] = params['checkout-reference']?.split(':') ?? []

  return {
    eventId,
    provider: params['checkout-provider'],
    registrationId,
    status: params['checkout-status'],
    transactionId: params['checkout-transaction-id'],
  }
}

export const verifyParams = async (params: Partial<PaytrailCallbackParams>) => {
  if (!params['checkout-transaction-id']) {
    logger.error('missing checkout-transaction-id from payment callback')
    throw new Error('Missing checkout-transaction-id from params')
  }

  if (!(await paytrail.verifyCallbackSignature(params))) {
    logger.error('verifying payment signature failed')
    throw new Error('Verifying payment signature failed')
  }
}

/**
 * The transaction and registration a provider's callback names, verified and read. Shared by
 * PaymentCancel and RefundCancel, the two callbacks that only ever receive a reference to an
 * existing transaction (KOE-1529).
 */
export const resolveCallbackTransaction = async <T extends JsonTransaction>(
  params: Partial<PaytrailCallbackParams>
) => {
  const { eventId, provider, registrationId, transactionId } = parseParams(params)

  await verifyParams(params)

  const transaction = await dynamoDB.read<T>({ transactionId })
  if (!transaction) throw new LambdaError(404, `Transaction with id '${transactionId}' was not found`)

  const registration = await getRegistration(eventId, registrationId)

  return { eventId, provider, registration, registrationId, transaction }
}

/**
 * Writes a transaction's status, for every status that is never a failure: `new`, `pending`,
 * `delayed`, and `ok` from the secretary's own refresh (KOE-1529). A failure goes through
 * `settleFailedTransaction` instead, which is the only writer of `fail` -- the type excludes it, so a
 * caller cannot reintroduce the untracked write this replaces. The write never lands on an already
 * settled transaction (rule 3): a condition shared with `failUnfinishedTransaction` refuses it.
 */
export const updateTransactionStatus = async (
  transaction: JsonTransaction | undefined,
  status: Exclude<JsonTransaction['status'], 'fail'> | undefined,
  provider?: string
): Promise<boolean> => {
  if (!transaction || !status) return false

  // Skip update if no changes
  if (transaction.statusAt && transaction.status === status && (!provider || transaction.provider === provider)) {
    logger.info('skipping no-op transaction status/provider update', { transactionId: transaction.transactionId })
    return false
  }

  // Prepare update object with set operations
  const updateObj: { set: Record<string, any>; remove?: string[] } = {
    set: {
      status,
      statusAt: new Date().toISOString(),
    },
  }

  // Add provider if provided
  if (provider) {
    updateObj.set.provider = provider
  }

  if (status !== 'new') {
    updateObj.remove = ['paymentResponse']
  }

  try {
    await dynamoDB.update(
      { transactionId: transaction.transactionId },
      updateObj,
      transactionTable,
      undefined,
      UNRESOLVED_CONDITION
    )
    return true
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      logger.info('transaction already settled, ignoring status update', { transactionId: transaction.transactionId })
      return false
    }
    throw error
  }
}

const transactionWasAlreadyApplied = async (transactionId: string) => {
  const current = await dynamoDB.read<JsonTransaction>({ transactionId }, transactionTable, true)
  return Boolean(current?.registrationAppliedAt)
}

const runRegistrationTransaction = async (
  transactionId: string,
  items: Parameters<CustomDynamoClient['documentTransaction']>[0]
) => {
  try {
    await dynamoDB.documentTransaction(items)
    return true
  } catch (error) {
    if (
      (error as Error).name === 'TransactionCanceledException' &&
      (await transactionWasAlreadyApplied(transactionId))
    ) {
      logger.info('transaction was already applied to its registration', { transactionId })
      return false
    }
    throw error
  }
}

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
  const transactionValues: Record<string, any> = {
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
  if (provider) {
    transactionSet.push('#provider = :provider')
    transactionNames['#provider'] = 'provider'
    transactionValues[':provider'] = provider
  }

  const transactionOperation = transactionExists
    ? {
        Update: {
          ConditionExpression: 'attribute_exists(transactionId) AND attribute_not_exists(registrationAppliedAt)',
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
    {
      Update: {
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: registrationValues,
        Key: { eventId, id: registrationId },
        TableName: registrationTable,
        UpdateExpression: `SET ${registrationSet.join(', ')} REMOVE paymentCreationAt, paymentCreationStamp ADD paidAmount :amount DELETE openPayments :transactionId`,
      },
    },
  ])

  return { applied, appliedAt }
}

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
    {
      Update: {
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeValues: {
          ':amount': transaction.amount / 100,
          ':appliedAt': appliedAt,
          ':handlingCost': (transaction.handlingCost ?? 0) / 100,
          ':refundStatus': 'SUCCESS',
          // DynamoDB's set-difference action; this transaction is no longer open (KOE-1529).
          ':transactionId': new Set([transaction.transactionId]),
        },
        Key: { eventId, id: registrationId },
        TableName: registrationTable,
        UpdateExpression:
          'SET refundAt = :appliedAt, refundStatus = :refundStatus, updatedAt = :appliedAt REMOVE refundCreationAt, refundCreationStamp ADD refundAmount :amount, refundHandlingCost :handlingCost DELETE openRefunds :transactionId',
      },
    },
  ])

  return { applied, appliedAt }
}

export const paymentDescription = (
  jsonEvent: Pick<JsonDogEvent | DogEvent, 'eventType' | 'startDate' | 'endDate' | 'name' | 'names' | 'location'>,
  language: Language
) => {
  const t = getFixedT(language)
  const eventDate = t('dateFormat.datespan', {
    end: jsonEvent.endDate,
    noYear: true,
    start: jsonEvent.startDate,
  })

  return [jsonEvent.eventType, eventDate, jsonEvent.location, localizedEventName(jsonEvent, language)]
    .filter(Boolean)
    .join(' ')
}

export const getTransactionsByReference = async (reference: string) =>
  dynamoDB.query<JsonPaymentTransaction | JsonRefundTransaction>({
    index: 'gsiReference',
    key: '#reference = :reference',
    names: {
      '#reference': 'reference',
    },
    table: transactionTable,
    values: { ':reference': reference },
  })

/**
 * Whether a payment is still being worked on, computed fresh from the registration's open payment
 * ids rather than a stored status (KOE-1529): `isPaymentInProgress` unchanged (pending, under 5
 * minutes old). In practice 0 or 1 ids; `batchGet` handles more just as well. A refund shares the
 * payment's reference but is never a payment in progress, so only `openPayments` feeds this.
 */
export const computePaymentInProgress = async (openPaymentIds: string[] | undefined): Promise<boolean> => {
  if (!openPaymentIds?.length) return false
  const transactions = await dynamoDB.batchGet<JsonPaymentTransaction>(
    openPaymentIds.map((transactionId) => ({ transactionId })),
    transactionTable
  )
  return transactions.some(isPaymentInProgress)
}

/**
 * A stored registration as its participant receives it: `paymentInProgress` computed fresh from
 * `openPayments`, never a stored PENDING (KOE-1529). GetRegistration and PutRegistration answer
 * through this.
 */
export const participantResponse = async (
  registration: JsonRegistration,
  editToken: string,
  event: JsonConfirmedEvent
) => {
  const paymentInProgress = await computePaymentInProgress(registration.openPayments)
  return participantRegistrationResponse({ ...registration, paymentInProgress }, editToken, event)
}

/**
 * The participant's payment patch of a stored registration, with `paymentInProgress` computed the
 * same way. The subscribe answer and `settleFailedTransaction`'s cancel patch are built through this.
 * PaymentSuccess builds its patch directly: the row it sends has just been written SUCCESS or
 * DUPLICATE, with nothing left open to compute (KOE-1529).
 */
export const participantPaymentPatch = async (registration: JsonRegistration, event: JsonConfirmedEvent) => {
  const paymentInProgress = await computePaymentInProgress(registration.openPayments)
  return buildParticipantPaymentPatch({ ...registration, paymentInProgress }, event)
}

const shouldRefreshTransactionStatus = (transaction: JsonPaymentTransaction | JsonRefundTransaction) =>
  transaction.type === 'refund'
    ? transaction.status !== 'ok'
    : ['new', 'pending', 'delayed'].includes(transaction.status)

const openSetFieldFor = (transaction: JsonPaymentTransaction | JsonRefundTransaction): OpenSetField =>
  transaction.type === 'payment' ? 'openPayments' : 'openRefunds'

const refreshedAuditMessage =
  (transaction: JsonPaymentTransaction | JsonRefundTransaction) =>
  (settledTransaction: JsonTransaction, provider: string | undefined): AuditMessage =>
    paymentAudit(
      transaction.type === 'payment' ? 'paymentFailed' : 'refundFailed',
      getProviderName(provider),
      formatMoney(settledTransaction.amount / 100)
    )

/**
 * The secretary's "refresh from Paytrail" button, the sixth writer that can find a transaction
 * failed (KOE-1529). A transaction Paytrail now reports `fail` settles through the shared step like
 * every other writer, with the registration this reference belongs to; everything else still only
 * updates the transaction's own status field, as before. Returns the refreshed transactions and
 * whatever settling found changed, for the handler to publish.
 */
export const refreshTransactionStatusesFromPaytrail = async (
  transactions: (JsonPaymentTransaction | JsonRefundTransaction)[] | undefined,
  registration: JsonRegistration
): Promise<{
  cancelled: CancelledRegistration[]
  transactions: (JsonPaymentTransaction | JsonRefundTransaction)[] | undefined
}> => {
  if (!transactions?.length) return { cancelled: [], transactions }

  const cancelled: CancelledRegistration[] = []

  const refreshed = await Promise.all(
    transactions.map(async (transaction) => {
      if (!shouldRefreshTransactionStatus(transaction)) return transaction

      const payment = await paytrail.getPayment(transaction.transactionId)
      if (!payment) return transaction

      if (payment.status === 'fail') {
        const settled = await settleFailedTransaction(transaction, registration, openSetFieldFor(transaction), {
          auditActor: transactionActor,
          auditMessage: refreshedAuditMessage(transaction),
          provider: payment.provider,
        })
        if (settled.cancelled) cancelled.push(settled.cancelled)
        return {
          ...transaction,
          provider: payment.provider,
          status: payment.status,
          statusAt: new Date().toISOString(),
        }
      }

      const updated = await updateTransactionStatus(transaction, payment.status, payment.provider)

      return {
        ...transaction,
        provider: payment.provider,
        status: payment.status,
        statusAt: updated ? new Date().toISOString() : transaction.statusAt,
      }
    })
  )

  return { cancelled, transactions: refreshed }
}
