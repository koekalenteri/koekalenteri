/**
 * Checks a registration's cached `paidAmount` / `refundAmount` / `refundHandlingCost` against what
 * its payment transactions actually settled, and separately flags transactions whose own state
 * looks wrong. Pure logic: no file I/O, no console output. Throws on real errors; a mismatch is
 * data, returned in the result, not an exception.
 *
 * A "transaction" here is already decoded to a plain object with the fields this module reads:
 * `{ reference, type: 'payment'|'refund', amount (cents), handlingCost? (cents), status,
 * createdAt, statusAt?, registrationAppliedAt?, duplicatePaymentAt?, transactionId }`. A
 * "registration" is
 * `{ eventId, id, paidAmount?, refundAmount?, refundHandlingCost?, paymentStatus?, refundStatus? }`
 * (euros, as cached on the row).
 */

/**
 * Euros to cents. The one place this conversion happens in this script; mirrors `toCents` in
 * `src/lib/money.ts` (always rounds, never floors or truncates) rather than importing it, since a
 * script run with plain `node` cannot load a `.ts` module at run time. `paymentLedger.test.mjs`
 * asserts the two agree.
 */
export const toCents = (euros) => Math.round(euros * 100)

export const registrationKey = (registration) => `${registration.eventId}:${registration.id}`

/** A transaction counts toward the registration's totals once Paytrail (or the secretary, for a
 * manual entry) has settled it and it was not rejected as a duplicate payment.
 * `registrationAppliedAt` is not required: an `ok` row written before that marker existed still
 * happened. */
export const isApplied = (transaction) => transaction.status === 'ok' && !transaction.duplicatePaymentAt

const MONEY_FIELDS = ['paidAmount', 'refundAmount', 'refundHandlingCost']

/** The per-money-field diff categories `categorizeFieldDiff` produces, in report order. */
export const FIELD_CATEGORIES = ['no_transactions', 'success_without_amount', 'amount_mismatch']

/** The per-transaction flag categories `categorizeTransaction` produces, in report order. */
export const TRANSACTION_CATEGORIES = [
  'legacy_applied',
  'ok_not_applied',
  'duplicate_payment',
  'stale_open_transaction',
  'orphan_transaction',
  'other',
]

const FIELD_STATUS = {
  paidAmount: 'paymentStatus',
  refundAmount: 'refundStatus',
  refundHandlingCost: 'refundStatus',
}

/** What a registration's field should hold, derived from its applied transactions. */
export const expectedCentsForField = (field, transactions) => {
  const applied = transactions.filter(isApplied)
  if (field === 'paidAmount') {
    return applied.filter((t) => t.type === 'payment').reduce((sum, t) => sum + t.amount, 0)
  }
  const refunds = applied.filter((t) => t.type === 'refund')
  if (field === 'refundAmount') return refunds.reduce((sum, t) => sum + t.amount, 0)
  return refunds.reduce((sum, t) => sum + (t.handlingCost ?? 0), 0)
}

/**
 * One field's diff for one registration, or `undefined` when the cached value already matches.
 * Precedence when it does not: `no_transactions` (nothing at all backs a nonzero stored value),
 * then `success_without_amount` (the known legacy shape: a successful status with a zero stored
 * amount that an applied transaction actually covers), else the generic `amount_mismatch`.
 */
export const categorizeFieldDiff = (field, registration, transactions) => {
  const expectedCents = expectedCentsForField(field, transactions)
  const storedCents = toCents(registration[field] ?? 0)
  if (expectedCents === storedCents) return undefined

  let category
  if (storedCents !== 0 && transactions.length === 0) {
    category = 'no_transactions'
  } else if (storedCents === 0 && expectedCents > 0 && registration[FIELD_STATUS[field]] === 'SUCCESS') {
    category = 'success_without_amount'
  } else {
    category = 'amount_mismatch'
  }

  return { category, diffCents: storedCents - expectedCents, expectedCents, field, storedCents }
}

/** Every flagged money-field row for one registration, keyed by its `eventId:id`. */
export const diffRegistration = (registration, transactions) => {
  const key = registrationKey(registration)
  return MONEY_FIELDS.flatMap((field) => {
    const diff = categorizeFieldDiff(field, registration, transactions)
    return diff ? [{ key, ...diff }] : []
  })
}

const NON_TERMINAL_STATUSES = new Set(['new', 'pending', 'delayed'])
const RESOLVED_STATUSES = new Set(['SUCCESS', 'CANCEL', 'DUPLICATE'])

/**
 * The health category of one transaction, independent of any registration field, or `undefined`
 * when it needs no row (a healthy applied payment, a healthy open one, or a silent `fail`).
 *
 * - `orphan_transaction`: its reference matches no registration at all.
 * - `duplicate_payment`: informational -- a captured payment rejected as a duplicate.
 * - `stale_open_transaction`: still `new`/`pending`/`delayed` while the registration's matching
 *   status field has already moved on.
 * - `legacy_applied` / `ok_not_applied`: `ok`, counted toward the registration's totals already
 *   (`isApplied` does not require the marker), but never got `registrationAppliedAt`. Split by
 *   `cutoff` (`buildTransactionIndex`), against the time *this* transaction actually became `ok`
 *   (`statusAt ?? createdAt` -- `createdAt` alone would be when it was opened, not settled): before
 *   the cutoff, this is the known pre-KOE-1337-style legacy shape; at or after it, something
 *   skipped the write.
 * - `other`: a status this module does not otherwise recognise.
 */
export const categorizeTransaction = (transaction, registration, cutoff) => {
  if (!registration) return 'orphan_transaction'
  if (transaction.duplicatePaymentAt) return 'duplicate_payment'

  if (NON_TERMINAL_STATUSES.has(transaction.status)) {
    const statusField = transaction.type === 'payment' ? registration.paymentStatus : registration.refundStatus
    return RESOLVED_STATUSES.has(statusField) ? 'stale_open_transaction' : undefined
  }

  if (transaction.status === 'fail') return undefined

  if (transaction.status === 'ok') {
    if (transaction.registrationAppliedAt) return undefined
    if (cutoff === undefined) return 'ok_not_applied'
    const resolvedAt = transaction.statusAt ?? transaction.createdAt
    return resolvedAt < cutoff ? 'legacy_applied' : 'ok_not_applied'
  }

  return 'other'
}

/**
 * Groups transactions by reference and finds `cutoff`: the earliest `registrationAppliedAt`
 * among all transactions (either type) that carry it. `cutoff` is `undefined` when none do, which
 * `categorizeTransaction` treats as "every candidate is `ok_not_applied`".
 *
 * This is deliberately `registrationAppliedAt`, not `createdAt`: the marker is stamped at apply
 * time, so a transaction created long before the marker existed but applied shortly after it would
 * pull a `createdAt`-based cutoff far too early, relabelling genuine legacy rows elsewhere in the
 * ledger as `ok_not_applied`.
 */
export const buildTransactionIndex = (transactions) => {
  const byReference = new Map()
  let cutoff

  for (const transaction of transactions) {
    const list = byReference.get(transaction.reference)
    if (list) list.push(transaction)
    else byReference.set(transaction.reference, [transaction])

    if (
      transaction.registrationAppliedAt &&
      (cutoff === undefined || transaction.registrationAppliedAt < cutoff)
    ) {
      cutoff = transaction.registrationAppliedAt
    }
  }

  return { byReference, cutoff }
}

/**
 * Runs the whole check. `transactions` is a materialized array (the index needs all of them before
 * any registration can be checked); `registrations` is any (sync or async) iterable, consumed one
 * at a time and never kept in full, so a 735 MB registration dump costs one row of memory at a
 * time rather than all of them.
 */
export const checkPaymentLedger = async ({ transactions, registrations }) => {
  const { byReference, cutoff } = buildTransactionIndex(transactions)
  const visited = new Set()
  const rows = []
  let registrationsScanned = 0

  for await (const registration of registrations) {
    registrationsScanned++
    const key = registrationKey(registration)
    visited.add(key)
    const transactionsForKey = byReference.get(key) ?? []

    rows.push(...diffRegistration(registration, transactionsForKey))

    for (const transaction of transactionsForKey) {
      const category = categorizeTransaction(transaction, registration, cutoff)
      if (category) rows.push({ category, key, transactionId: transaction.transactionId })
    }
  }

  let transactionsLoaded = 0
  let orphanCount = 0
  for (const [key, transactionsForKey] of byReference) {
    transactionsLoaded += transactionsForKey.length
    if (visited.has(key)) continue
    orphanCount++
    for (const transaction of transactionsForKey) {
      rows.push({ category: 'orphan_transaction', key, transactionId: transaction.transactionId })
    }
  }

  return { cutoff, orphanCount, registrationsScanned, rows, transactionsLoaded }
}
