import { toCents as productionToCents } from '../../src/lib/money'

import {
  buildTransactionIndex,
  categorizeFieldDiff,
  categorizeTransaction,
  checkPaymentLedger,
  diffRegistration,
  expectedCentsForField,
  isApplied,
  registrationKey,
  toCents,
} from './paymentLedger.mjs'

const payment = (overrides = {}) => ({
  amount: 4500,
  createdAt: '2026-01-01T00:00:00.000Z',
  reference: 'evt-1:reg-1',
  status: 'ok',
  transactionId: 'tx-payment',
  type: 'payment',
  ...overrides,
})

const refund = (overrides = {}) => ({
  amount: 1000,
  createdAt: '2026-01-02T00:00:00.000Z',
  handlingCost: 200,
  reference: 'evt-1:reg-1',
  status: 'ok',
  transactionId: 'tx-refund',
  type: 'refund',
  ...overrides,
})

const registration = (overrides = {}) => ({
  eventId: 'evt-1',
  id: 'reg-1',
  paidAmount: 45,
  paymentStatus: 'SUCCESS',
  ...overrides,
})

describe('toCents', () => {
  it('rounds, never floors or truncates', () => {
    expect(toCents(45)).toBe(4500)
    expect(toCents(0.005)).toBe(1)
    expect(toCents(12.344)).toBe(1234)
    expect(toCents(12.346)).toBe(1235)
  })

  it('agrees with the production toCents in src/lib/money.ts, which this one mirrors', () => {
    for (const euros of [0, 0.005, 12.344, 12.346, 10.05, 9.85, -4.5, -0.005]) {
      expect(toCents(euros)).toBe(productionToCents(euros))
    }
  })
})

describe('registrationKey', () => {
  it('joins eventId and id with a colon', () => {
    expect(registrationKey({ eventId: 'evt-1', id: 'reg-1' })).toBe('evt-1:reg-1')
  })
})

describe('isApplied', () => {
  it('is true only for ok status without duplicatePaymentAt', () => {
    expect(isApplied(payment({ status: 'ok' }))).toBe(true)
    expect(isApplied(payment({ status: 'ok', duplicatePaymentAt: '2026-01-01T00:00:00.000Z' }))).toBe(false)
    expect(isApplied(payment({ status: 'new' }))).toBe(false)
    expect(isApplied(payment({ status: 'fail' }))).toBe(false)
    expect(isApplied(payment({ status: 'pending' }))).toBe(false)
    expect(isApplied(payment({ status: 'delayed' }))).toBe(false)
  })

  it('does not require registrationAppliedAt', () => {
    expect(isApplied(payment({ registrationAppliedAt: undefined, status: 'ok' }))).toBe(true)
  })
})

describe('expectedCentsForField', () => {
  it('sums applied payment amounts for paidAmount', () => {
    const transactions = [payment({ amount: 4500 }), payment({ amount: 1000, status: 'fail' })]
    expect(expectedCentsForField('paidAmount', transactions)).toBe(4500)
  })

  it('sums applied refund amounts for refundAmount', () => {
    const transactions = [refund({ amount: 1000 }), refund({ amount: 500, status: 'new' })]
    expect(expectedCentsForField('refundAmount', transactions)).toBe(1000)
  })

  it('sums applied refund handling costs for refundHandlingCost, defaulting a missing one to 0', () => {
    const transactions = [refund({ handlingCost: 200 }), refund({ handlingCost: undefined, transactionId: 'tx-2' })]
    expect(expectedCentsForField('refundHandlingCost', transactions)).toBe(200)
  })

  it('excludes duplicate payments from paidAmount', () => {
    const transactions = [payment({ amount: 4500, duplicatePaymentAt: '2026-01-01T00:00:00.000Z' })]
    expect(expectedCentsForField('paidAmount', transactions)).toBe(0)
  })
})

describe('categorizeFieldDiff', () => {
  it('returns undefined when the stored value already matches', () => {
    const transactions = [payment({ amount: 4500 })]
    expect(categorizeFieldDiff('paidAmount', registration({ paidAmount: 45 }), transactions)).toBeUndefined()
  })

  it('flags no_transactions when stored is nonzero and no transactions exist at all', () => {
    const result = categorizeFieldDiff('paidAmount', registration({ paidAmount: 45 }), [])
    expect(result).toEqual({
      category: 'no_transactions',
      diffCents: 4500,
      expectedCents: 0,
      field: 'paidAmount',
      storedCents: 4500,
    })
  })

  it('flags success_without_amount for the legacy shape: SUCCESS, stored 0, an applied amount exists', () => {
    const transactions = [payment({ amount: 4500 })]
    const result = categorizeFieldDiff(
      'paidAmount',
      registration({ paidAmount: 0, paymentStatus: 'SUCCESS' }),
      transactions
    )
    expect(result).toEqual({
      category: 'success_without_amount',
      diffCents: -4500,
      expectedCents: 4500,
      field: 'paidAmount',
      storedCents: 0,
    })
  })

  it('does not flag success_without_amount when the status is not SUCCESS', () => {
    const transactions = [payment({ amount: 4500 })]
    const result = categorizeFieldDiff(
      'paidAmount',
      registration({ paidAmount: 0, paymentStatus: 'PENDING' }),
      transactions
    )
    expect(result?.category).toBe('amount_mismatch')
  })

  it('falls back to amount_mismatch for every other difference', () => {
    const transactions = [payment({ amount: 4500 })]
    const result = categorizeFieldDiff('paidAmount', registration({ paidAmount: 40 }), transactions)
    expect(result).toEqual({
      category: 'amount_mismatch',
      diffCents: -500,
      expectedCents: 4500,
      field: 'paidAmount',
      storedCents: 4000,
    })
  })

  it('checks refundStatus, not paymentStatus, for refund fields', () => {
    const transactions = [refund({ amount: 1000 })]
    const result = categorizeFieldDiff(
      'refundAmount',
      registration({ paymentStatus: 'SUCCESS', refundAmount: 0, refundStatus: 'SUCCESS' }),
      transactions
    )
    expect(result?.category).toBe('success_without_amount')
  })
})

describe('diffRegistration', () => {
  it('reports one row per mismatched field, keyed by eventId:id, and none for matching fields', () => {
    const transactions = [payment({ amount: 4500 }), refund({ amount: 1000, handlingCost: 200 })]
    const rows = diffRegistration(
      registration({ paidAmount: 45, refundAmount: 0, refundHandlingCost: 0, refundStatus: 'SUCCESS' }),
      transactions
    )
    expect(rows).toEqual([
      { category: 'success_without_amount', diffCents: -1000, expectedCents: 1000, field: 'refundAmount', key: 'evt-1:reg-1', storedCents: 0 },
      {
        category: 'success_without_amount',
        diffCents: -200,
        expectedCents: 200,
        field: 'refundHandlingCost',
        key: 'evt-1:reg-1',
        storedCents: 0,
      },
    ])
  })

  it('reports nothing for the known legacy case: SUCCESS, no amount, no transactions at all', () => {
    const rows = diffRegistration(registration({ paidAmount: undefined, paymentStatus: 'SUCCESS' }), [])
    expect(rows).toEqual([])
  })
})

describe('categorizeTransaction', () => {
  const reg = registration()

  it('flags orphan_transaction when no registration matches the reference', () => {
    expect(categorizeTransaction(payment(), undefined, undefined)).toBe('orphan_transaction')
  })

  it('flags duplicate_payment regardless of registration state', () => {
    const tx = payment({ duplicatePaymentAt: '2026-01-01T00:00:00.000Z' })
    expect(categorizeTransaction(tx, reg, undefined)).toBe('duplicate_payment')
  })

  it('flags stale_open_transaction for a non-terminal row whose registration status already resolved', () => {
    const tx = payment({ status: 'pending' })
    expect(categorizeTransaction(tx, registration({ paymentStatus: 'SUCCESS' }), undefined)).toBe(
      'stale_open_transaction'
    )
    expect(categorizeTransaction(payment({ status: 'new' }), registration({ paymentStatus: 'CANCEL' }), undefined)).toBe(
      'stale_open_transaction'
    )
    expect(
      categorizeTransaction(refund({ status: 'delayed' }), registration({ refundStatus: 'DUPLICATE' }), undefined)
    ).toBe('stale_open_transaction')
  })

  it('does not flag a non-terminal row whose registration status is still open', () => {
    const tx = payment({ status: 'pending' })
    expect(categorizeTransaction(tx, registration({ paymentStatus: 'PENDING' }), undefined)).toBeUndefined()
  })

  it('is silent for fail', () => {
    expect(categorizeTransaction(payment({ status: 'fail' }), reg, undefined)).toBeUndefined()
  })

  it('does not flag an ok transaction that already carries registrationAppliedAt', () => {
    const tx = payment({ registrationAppliedAt: '2026-01-01T00:00:00.000Z', status: 'ok' })
    expect(categorizeTransaction(tx, reg, '2025-01-01T00:00:00.000Z')).toBeUndefined()
  })

  it('flags legacy_applied for an ok row without the marker, created before cutoff', () => {
    const tx = payment({ createdAt: '2025-01-01T00:00:00.000Z', status: 'ok' })
    expect(categorizeTransaction(tx, reg, '2026-01-01T00:00:00.000Z')).toBe('legacy_applied')
  })

  it('flags ok_not_applied for an ok row without the marker, created at or after cutoff', () => {
    const tx = payment({ createdAt: '2026-06-01T00:00:00.000Z', status: 'ok' })
    expect(categorizeTransaction(tx, reg, '2026-01-01T00:00:00.000Z')).toBe('ok_not_applied')
  })

  it('classifies an unmarked ok row by statusAt, not createdAt, when both are present', () => {
    // Created long before the cutoff but only resolved (statusAt) after it: it is the createdAt
    // that would wrongly read as legacy here.
    const tx = payment({ createdAt: '2020-01-01T00:00:00.000Z', status: 'ok', statusAt: '2026-06-01T00:00:00.000Z' })
    expect(categorizeTransaction(tx, reg, '2026-01-01T00:00:00.000Z')).toBe('ok_not_applied')
  })

  it('falls back to createdAt when statusAt is absent', () => {
    const tx = payment({ createdAt: '2025-01-01T00:00:00.000Z', status: 'ok', statusAt: undefined })
    expect(categorizeTransaction(tx, reg, '2026-01-01T00:00:00.000Z')).toBe('legacy_applied')
  })

  it('treats every ok-without-marker row as ok_not_applied when no cutoff exists', () => {
    const tx = payment({ createdAt: '2020-01-01T00:00:00.000Z', status: 'ok' })
    expect(categorizeTransaction(tx, reg, undefined)).toBe('ok_not_applied')
  })

  it('falls back to other for an unrecognised status', () => {
    const tx = payment({ status: 'weird' })
    expect(categorizeTransaction(tx, reg, undefined)).toBe('other')
  })
})

describe('buildTransactionIndex', () => {
  it('groups transactions by reference', () => {
    const transactions = [
      payment({ reference: 'evt-1:reg-1' }),
      refund({ reference: 'evt-1:reg-1' }),
      payment({ reference: 'evt-2:reg-2' }),
    ]
    const { byReference } = buildTransactionIndex(transactions)
    expect(byReference.get('evt-1:reg-1')).toHaveLength(2)
    expect(byReference.get('evt-2:reg-2')).toHaveLength(1)
  })

  it('finds the earliest registrationAppliedAt among transactions carrying it, of either type', () => {
    const transactions = [
      payment({ createdAt: '2026-03-01T00:00:00.000Z', registrationAppliedAt: '2026-03-01T00:00:05.000Z' }),
      refund({ createdAt: '2026-01-01T00:00:00.000Z', registrationAppliedAt: '2026-01-01T00:00:05.000Z' }),
      payment({ createdAt: '2020-01-01T00:00:00.000Z' }), // no marker: not a candidate
    ]
    expect(buildTransactionIndex(transactions).cutoff).toBe('2026-01-01T00:00:05.000Z')
  })

  it('leaves cutoff undefined when no transaction carries the marker', () => {
    expect(buildTransactionIndex([payment(), refund()]).cutoff).toBeUndefined()
  })

  it('uses registrationAppliedAt, not createdAt, so an early-created transaction applied late does not pull the cutoff too early', () => {
    // A refund created well before any marker existed, but only applied (and marked) much later.
    // A createdAt-based cutoff would read this as "2026-06-01", wrongly relabelling genuinely
    // legacy rows elsewhere in the ledger as ok_not_applied.
    const earlyCreatedLateApplied = refund({
      createdAt: '2026-06-01T00:00:00.000Z',
      reference: 'evt-1:reg-1',
      registrationAppliedAt: '2026-09-01T00:00:00.000Z',
    })
    // The transaction that actually sets the earliest cutoff.
    const cutoffSetter = payment({
      reference: 'evt-1:reg-3',
      registrationAppliedAt: '2026-08-05T00:00:00.000Z',
      transactionId: 'tx-cutoff-setter',
    })
    // A genuinely legacy row: ok, no marker, resolved (statusAt) well before the real cutoff.
    const legacyPayment = payment({
      createdAt: '2020-01-01T00:00:00.000Z',
      reference: 'evt-1:reg-2',
      statusAt: '2026-07-01T00:00:00.000Z',
      transactionId: 'tx-legacy',
    })

    const { cutoff } = buildTransactionIndex([earlyCreatedLateApplied, cutoffSetter, legacyPayment])
    expect(cutoff).toBe('2026-08-05T00:00:00.000Z')

    expect(categorizeTransaction(legacyPayment, registration({ eventId: 'evt-1', id: 'reg-2' }), cutoff)).toBe(
      'legacy_applied'
    )
  })
})

describe('checkPaymentLedger', () => {
  it('combines field diffs and transaction flags across a stream of registrations', async () => {
    const transactions = [
      payment({ amount: 4500, reference: 'evt-1:reg-1' }),
      payment({
        createdAt: '2026-05-01T00:00:00.000Z',
        reference: 'evt-1:reg-2',
        registrationAppliedAt: '2026-05-01T00:00:05.000Z',
        transactionId: 'tx-applied',
      }),
      payment({ reference: 'evt-1:orphan', transactionId: 'tx-orphan' }),
    ]

    async function* registrations() {
      yield registration({ eventId: 'evt-1', id: 'reg-1', paidAmount: 0, paymentStatus: 'SUCCESS' })
      yield registration({ eventId: 'evt-1', id: 'reg-2', paidAmount: 45 })
    }

    const result = await checkPaymentLedger({ registrations: registrations(), transactions })

    expect(result.registrationsScanned).toBe(2)
    expect(result.transactionsLoaded).toBe(3)
    expect(result.orphanCount).toBe(1)
    expect(result.cutoff).toBe('2026-05-01T00:00:05.000Z')

    // reg-1's payment predates the cutoff (reg-2's applied transaction) and never got the marker,
    // so it is both a money-field mismatch (success_without_amount) and its own flagged row
    // (legacy_applied); the orphan reference adds a third.
    const categories = result.rows.map((row) => row.category).sort()
    expect(categories).toEqual(['legacy_applied', 'orphan_transaction', 'success_without_amount'])

    const orphanRow = result.rows.find((row) => row.category === 'orphan_transaction')
    expect(orphanRow).toEqual({ category: 'orphan_transaction', key: 'evt-1:orphan', transactionId: 'tx-orphan' })
  })

  it('flags no_transactions through the full pipeline for a registration with a stored amount and no transactions at all', async () => {
    async function* registrations() {
      yield registration({ eventId: 'evt-1', id: 'reg-1', paidAmount: 45 })
    }

    const result = await checkPaymentLedger({ registrations: registrations(), transactions: [] })

    expect(result.rows).toEqual([
      {
        category: 'no_transactions',
        diffCents: 4500,
        expectedCents: 0,
        field: 'paidAmount',
        key: 'evt-1:reg-1',
        storedCents: 4500,
      },
    ])
    expect(result.orphanCount).toBe(0)
    expect(result.transactionsLoaded).toBe(0)
    expect(result.registrationsScanned).toBe(1)
  })

  it('reports nothing for a clean registration applied through its transactions', async () => {
    const transactions = [
      payment({
        amount: 4500,
        createdAt: '2026-01-01T00:00:00.000Z',
        reference: 'evt-1:reg-1',
        registrationAppliedAt: '2026-01-01T00:00:05.000Z',
      }),
    ]

    async function* registrations() {
      yield registration({ eventId: 'evt-1', id: 'reg-1', paidAmount: 45 })
    }

    const result = await checkPaymentLedger({ registrations: registrations(), transactions })
    expect(result.rows).toEqual([])
    expect(result.orphanCount).toBe(0)
  })
})
