import { formatSummary, parseArgs } from './check-payment-ledger.mjs'

describe('parseArgs', () => {
  it('returns help for --help', () => {
    expect(parseArgs(['--help'])).toEqual({ help: true })
  })

  it('returns help for -h', () => {
    expect(parseArgs(['-h'])).toEqual({ help: true })
  })

  it('throws when the directory is missing', () => {
    expect(() => parseArgs([])).toThrow(/Directory is required/)
  })

  it('throws on an extra argument', () => {
    expect(() => parseArgs(['/some/dir', 'extra'])).toThrow(/Unexpected argument: extra/)
  })

  it('returns the directory when given exactly one argument', () => {
    expect(parseArgs(['/some/dir'])).toEqual({ dir: '/some/dir' })
  })
})

describe('formatSummary', () => {
  const row = (category, extra = {}) => ({ category, key: 'evt-1:reg-1', ...extra })

  it('prints a count for every field category and every transaction category', () => {
    const rows = [
      row('no_transactions', { diffCents: 100, expectedCents: 0, field: 'paidAmount', storedCents: 100 }),
      row('success_without_amount', {
        diffCents: -100,
        expectedCents: 100,
        field: 'refundAmount',
        storedCents: 0,
      }),
      row('amount_mismatch', { diffCents: 50, expectedCents: 50, field: 'refundHandlingCost', storedCents: 100 }),
      row('legacy_applied', { transactionId: 'tx-1' }),
      row('ok_not_applied', { transactionId: 'tx-2' }),
      row('duplicate_payment', { transactionId: 'tx-3' }),
      row('stale_open_transaction', { transactionId: 'tx-4' }),
      row('orphan_transaction', { transactionId: 'tx-5' }),
      row('other', { transactionId: 'tx-6' }),
    ]

    const summary = formatSummary({
      cutoff: '2026-01-01T00:00:00.000Z',
      orphanCount: 1,
      registrationsScanned: 10,
      rows,
      transactionsLoaded: 20,
    })

    expect(summary).toContain(
      'Cutoff (earliest transaction carrying registrationAppliedAt): 2026-01-01T00:00:00.000Z'
    )
    expect(summary).toContain('Registrations scanned: 10')
    expect(summary).toContain('Transactions loaded: 20')
    expect(summary).toContain('Orphan transactions (reference matches no registration): 1')

    for (const category of ['no_transactions', 'success_without_amount', 'amount_mismatch']) {
      expect(summary).toContain(`  ${category}: 1`)
    }
    for (const field of ['paidAmount', 'refundAmount', 'refundHandlingCost']) {
      expect(summary).toContain(`  ${field}: 1`)
    }
    for (const category of [
      'legacy_applied',
      'ok_not_applied',
      'duplicate_payment',
      'stale_open_transaction',
      'orphan_transaction',
      'other',
    ]) {
      expect(summary).toContain(`  ${category}: 1`)
    }

    expect(summary).not.toContain('Unexpected categories')
  })

  it('shows "none found" when there is no cutoff', () => {
    const summary = formatSummary({
      cutoff: undefined,
      orphanCount: 0,
      registrationsScanned: 0,
      rows: [],
      transactionsLoaded: 0,
    })
    expect(summary).toContain('Cutoff (earliest transaction carrying registrationAppliedAt): none found')
  })

  it('surfaces an unrecognised category as a bug line rather than dropping it silently', () => {
    const rows = [row('mystery_category', { transactionId: 'tx-1' })]
    const summary = formatSummary({
      cutoff: undefined,
      orphanCount: 0,
      registrationsScanned: 1,
      rows,
      transactionsLoaded: 1,
    })
    expect(summary).toContain('Unexpected categories (this is a bug in the check, not a finding):')
    expect(summary).toContain('  mystery_category: 1')
  })
})
