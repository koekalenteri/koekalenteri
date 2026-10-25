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
} from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import type { PaytrailError } from './paytrail'
import type { OpenSetField } from './repositories/registrationRepository'
import { getFixedT } from '../../i18n/lambda'
import { auditUser, paymentAudit, refundPaytrailFailedAudit } from '../../lib/audit'
import { localizedEventName } from '../../lib/event'
import { formatMoney } from '../../lib/money'
import { getProviderName, paytrailErrorText, transactionActor } from '../../lib/payment'
import { audit, registrationAuditKey } from './audit'
import { getEvent } from './event'
import { LambdaError } from './lambda'
import { logger } from './log'
import { paytrail } from './paytrail'
import { getRegistration, participantRegistrationResponse } from './registration'
import { dropOpenTransactionId, readRegistration } from './repositories/registrationRepository'
import {
  failUnfinishedTransaction,
  readPaymentTransactions,
  readTransaction,
  updateUnresolvedTransaction,
} from './repositories/transactionRepository'
import { publishParticipantRegistrationPatches, publishRegistrationPatches } from './ws/actions'
import { bestEffort } from './ws/livePush'
import { buildParticipantPaymentPatch } from './ws/payloads'

/** A refund Paytrail refused, for the registration's trail. */
export const refundPaytrailErrorAudit = (error: PaytrailError) =>
  refundPaytrailFailedAudit(error.status, paytrailErrorText(error.error))

/**
 * A registration whose payment or refund was settled as failed, for whoever sends it on. The domain
 * writes the row and says which one changed; what the pages are told is read from the table when it
 * is sent (`publishCancelledRegistration`), inside the push, so the settle never waits on that read
 * (KOE-1340, KOE-1529, KOE-1566).
 */
export interface CancelledRegistration {
  eventId: string
  /** The open set the transaction's id was dropped from: what the admins' patch carries. */
  field: OpenSetField
  registrationId: string
}

/**
 * True once the app itself has disposed of the transaction: applied it, marked it a duplicate, or
 * already failed it. Paytrail's own word `ok` is never enough on its own -- an email refund answers
 * `ok` while the refund is still pending the customer's bank account (KOE-1529).
 */
export const isTransactionSettled = (
  transaction: Pick<JsonTransaction, 'registrationAppliedAt' | 'duplicatePaymentAt' | 'status'>
): boolean =>
  Boolean(transaction.registrationAppliedAt) || Boolean(transaction.duplicatePaymentAt) || transaction.status === 'fail'

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
  const before = await dropOpenTransactionId(registration.eventId, registration.id, field, transactionId, updatedAt)
  return before?.includes(transactionId) ?? false
}

interface SettledTransaction {
  /** Whether this call's conditional write was the one that moved the transaction to `fail`. */
  moved: boolean
  /** Whether this call's removal actually found the id still in the open set. */
  changed: boolean
  /** Only set when `changed`: which registration to publish, read fresh when it is sent. */
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
 * transaction write exactly one), and only the call whose removal actually found the id open answers
 * `cancelled`, so only the call that changed something publishes. Nothing is read after the writes:
 * the patches are built when they are sent, from a fresh, strongly consistent read, never the row
 * this call started with (KOE-1566).
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
  const moved = await failUnfinishedTransaction(transaction.transactionId, options.provider, now)
  const changed = await dropOpenTransaction(registration, field, transaction.transactionId, now)

  if (moved) {
    await audit({
      auditKey: registrationAuditKey(registration),
      ...options.auditMessage(transaction, options.provider),
      ...auditUser(options.auditActor(transaction)),
    })
  }

  if (!changed) return { changed, moved }

  return { cancelled: { eventId: registration.eventId, field, registrationId: registration.id }, changed, moved }
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

interface TransactionOfType {
  payment: JsonPaymentTransaction
  refund: JsonRefundTransaction
}

type TransactionType = keyof TransactionOfType

const isTransactionOfType = <K extends TransactionType>(
  transaction: JsonTransaction,
  type: K
): transaction is TransactionOfType[K] => transaction.type === type

/**
 * The stored transaction a callback names, refused unless it is the route's own type. Paytrail signs
 * the payer's return address with the same parameters as its callbacks, and a payment's reference and
 * amount are the payment's own, so its signed parameters verify on the refund routes too, and a
 * refund's on the payment routes. Only the stored type tells them apart, so this runs right after the
 * transaction is read and before anything else is read or written (KOE-1608).
 */
export const assertCallbackTransactionType = <K extends TransactionType>(
  transaction: JsonTransaction,
  type: K
): TransactionOfType[K] => {
  if (!isTransactionOfType(transaction, type)) {
    throw new LambdaError(400, `Transaction '${transaction.transactionId}' is a ${transaction.type}, not a ${type}`)
  }
  return transaction
}

/**
 * The transaction and registration a provider's callback names, verified and read. Shared by
 * PaymentCancel and RefundCancel, the two callbacks that only ever receive a reference to an
 * existing transaction (KOE-1529). The transaction must be of the route's `type` (KOE-1608).
 */
export const resolveCallbackTransaction = async <K extends TransactionType>(
  params: Partial<PaytrailCallbackParams>,
  type: K
) => {
  const { eventId, provider, registrationId, transactionId } = parseParams(params)

  await verifyParams(params)

  const stored = await readTransaction(transactionId)
  if (!stored) throw new LambdaError(404, `Transaction with id '${transactionId}' was not found`)
  const transaction = assertCallbackTransactionType(stored, type)

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
  const updateObj: { set: Record<string, unknown>; remove?: string[] } = {
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

  if (await updateUnresolvedTransaction(transaction.transactionId, updateObj)) return true
  logger.info('transaction already settled, ignoring status update', { transactionId: transaction.transactionId })
  return false
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

/**
 * The payments still being worked on, loaded fresh from the registration's open payment ids rather
 * than read from a stored status (KOE-1529): the transactions the payment picture decides
 * `inProgress` from (`isPaymentInProgress`: pending, under 5 minutes old). In practice 0 or 1 ids;
 * `batchGet` handles more just as well. A refund shares the payment's reference but is never a
 * payment in progress, so only `openPayments` feeds this. Every response to the participant loads
 * them: a picture built without them would offer the pay button mid-payment (KOE-1530).
 */
export const loadOpenPayments = async (openPaymentIds: string[] | undefined): Promise<JsonPaymentTransaction[]> => {
  if (!openPaymentIds?.length) return []
  return readPaymentTransactions(openPaymentIds)
}

/**
 * A stored registration as its participant receives it: the payment picture worked out from the
 * whole row and its open payments, loaded fresh (KOE-1529, KOE-1530). GetRegistration and
 * PutRegistration answer through this.
 */
export const participantResponse = async (
  registration: JsonRegistration,
  editToken: string,
  event: JsonConfirmedEvent
) => participantRegistrationResponse(registration, editToken, event, await loadOpenPayments(registration.openPayments))

/**
 * The participant's payment patch of a stored registration, with its picture built the same way. The
 * subscribe answer, `publishCancelledRegistration`'s entrant patch and the stored patches every
 * other sender publishes (`storedParticipantPaymentPatch`) are built through this: a row whose open set was just emptied loads nothing, which is exactly its state
 * (KOE-1529).
 */
export const participantPaymentPatch = async (registration: JsonRegistration, event: JsonConfirmedEvent) =>
  buildParticipantPaymentPatch(registration, event, await loadOpenPayments(registration.openPayments))

/**
 * The participant's payment patch of a registration as it is stored now: read strongly consistent
 * after the caller's own write, so the patch carries that write's `updatedAt` and whatever a payment
 * changed meanwhile (KOE-1553). Undefined for a row that is not there.
 */
export const storedParticipantPaymentPatch = async (event: JsonConfirmedEvent, registrationId: string) => {
  const stored = await readRegistration(event.id, registrationId, true)
  return stored ? participantPaymentPatch(stored, event) : undefined
}

const publishStoredParticipantPayments = (
  eventId: string,
  registrationIds: readonly string[],
  loadEvent: () => Promise<JsonConfirmedEvent>
) =>
  publishParticipantRegistrationPatches(eventId, registrationIds, async (registrationId) =>
    storedParticipantPaymentPatch(await loadEvent(), registrationId)
  )

/**
 * Tells the entrants of these registrations what their payment now looks like, each from the row as
 * stored (KOE-1553). Only the pages that are open get a patch, and only their rows are read.
 */
export const publishParticipantPayments = (event: JsonConfirmedEvent, registrationIds: readonly string[]) =>
  publishStoredParticipantPayments(event.id, registrationIds, () => Promise.resolve(event))

/**
 * The same for a caller that holds only the event's id: the event is read inside the push, and only
 * when a page is open (PaymentSuccess, KOE-1566).
 */
export const publishParticipantPaymentsOfEvent = (eventId: string, registrationIds: readonly string[]) => {
  let event: Promise<JsonConfirmedEvent> | undefined
  return publishStoredParticipantPayments(eventId, registrationIds, () => {
    event ??= getEvent<JsonConfirmedEvent>(eventId)
    return event
  })
}

/** The settled row and its event for `publishCancelledRegistration`; undefined when the row is gone. */
const readCancelledRegistration = async (eventId: string, registrationId: string) => {
  const [registration, event] = await Promise.all([
    readRegistration(eventId, registrationId, true),
    getEvent<JsonConfirmedEvent>(eventId),
  ])
  return registration ? { event, registration } : undefined
}

/**
 * A registration whose payment or refund was settled as failed reaches two audiences: the
 * organizer's admins watching the event get the open set and `updatedAt`, and the entrant looking at
 * their own registration gets the payment picture (KOE-1526, KOE-1529). Both are built from one
 * strongly consistent read taken after the settle's writes, so a writer caught between its own two
 * writes (settleFailedTransaction's failUnfinishedTransaction and dropOpenTransaction, say) is seen
 * as the row holds it now. The read is part of the push: a failed read is logged like a failed send
 * (KOE-1566).
 */
export const publishCancelledRegistration = ({ eventId, field, registrationId }: CancelledRegistration) =>
  bestEffort('cancelled registration', async () => {
    const read = await readCancelledRegistration(eventId, registrationId)
    if (!read) return
    const { event, registration } = read

    await Promise.all([
      publishRegistrationPatches(
        eventId,
        [{ [field]: registration[field], eventId, id: registrationId, updatedAt: registration.updatedAt }],
        event.organizer.id
      ),
      publishParticipantRegistrationPatches(eventId, [registrationId], () =>
        participantPaymentPatch(registration, event)
      ),
    ])
  })

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
