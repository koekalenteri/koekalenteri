#!/usr/bin/env node
import { resolve } from 'node:path'

import { decodeItem, scanItems } from './lib/dynamoScan.mjs'
import { checkPaymentLedger, FIELD_CATEGORIES, TRANSACTION_CATEGORIES } from './lib/paymentLedger.mjs'

const usage = `Usage:
  npm run check-payment-ledger -- <dir>

<dir> must contain event-registration-table.json and transaction-table.json: DynamoDB scan
dumps in the AttributeValue JSON shape ({"Items": [ { "attr": {"S": "..."} }, ... ] }).

Reads both tables (never writes anything) and reports, per registration, every money field
(paidAmount, refundAmount, refundHandlingCost) whose cached value does not match what the
registration's transactions actually settled, and separately, every transaction whose own state
looks wrong: legacy_applied, ok_not_applied, duplicate_payment, stale_open_transaction,
orphan_transaction, other.

Does not print names, emails, phone numbers or dog registration numbers -- only the
eventId:registrationId key and transaction ids.`

const TRANSACTION_FIELDS = [
  'reference',
  'type',
  'amount',
  'handlingCost',
  'status',
  'createdAt',
  'statusAt',
  'registrationAppliedAt',
  'duplicatePaymentAt',
  'transactionId',
]

const REGISTRATION_FIELDS = [
  'eventId',
  'id',
  'paidAmount',
  'refundAmount',
  'refundHandlingCost',
  'paymentStatus',
  'refundStatus',
  'dog',
]

export const parseArgs = (args) => {
  if (args.includes('--help') || args.includes('-h')) return { help: true }
  const [dir, ...rest] = args
  if (!dir) throw new Error(`Directory is required.\n\n${usage}`)
  if (rest.length > 0) throw new Error(`Unexpected argument: ${rest[0]}\n\n${usage}`)
  return { dir }
}

const loadTransactions = async (filePath) => {
  const transactions = []
  for await (const text of scanItems(filePath)) {
    transactions.push(decodeItem(text, TRANSACTION_FIELDS))
  }
  return transactions
}

// Registration rows are the items with a `dog` field; the table also holds other item kinds this
// check does not concern itself with.
async function* loadRegistrations(filePath) {
  for await (const text of scanItems(filePath)) {
    const fields = decodeItem(text, REGISTRATION_FIELDS)
    if (fields.dog === undefined) continue
    yield fields
  }
}

export const formatSummary = ({ cutoff, orphanCount, registrationsScanned, rows, transactionsLoaded }) => {
  const counts = {}
  const byField = {}
  for (const row of rows) {
    counts[row.category] = (counts[row.category] ?? 0) + 1
    if (row.field) byField[row.field] = (byField[row.field] ?? 0) + 1
  }

  const lines = [
    `Cutoff (earliest transaction carrying registrationAppliedAt): ${cutoff ?? 'none found'}`,
    `Registrations scanned: ${registrationsScanned}`,
    `Transactions loaded: ${transactionsLoaded}`,
    `Orphan transactions (reference matches no registration): ${orphanCount}`,
    '',
    'Money field mismatches by category:',
  ]
  for (const category of FIELD_CATEGORIES) lines.push(`  ${category}: ${counts[category] ?? 0}`)
  lines.push('', 'Money field mismatches by field:')
  for (const field of ['paidAmount', 'refundAmount', 'refundHandlingCost']) lines.push(`  ${field}: ${byField[field] ?? 0}`)
  lines.push('', 'Flagged transactions by category:')
  for (const category of TRANSACTION_CATEGORIES) lines.push(`  ${category}: ${counts[category] ?? 0}`)

  const known = new Set([...FIELD_CATEGORIES, ...TRANSACTION_CATEGORIES])
  const unexpected = Object.keys(counts).filter((category) => !known.has(category))
  if (unexpected.length > 0) {
    lines.push('', 'Unexpected categories (this is a bug in the check, not a finding):')
    for (const category of unexpected) lines.push(`  ${category}: ${counts[category]}`)
  }

  return lines.join('\n')
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage)
    return
  }

  const registrationPath = resolve(options.dir, 'event-registration-table.json')
  const transactionPath = resolve(options.dir, 'transaction-table.json')

  const transactions = await loadTransactions(transactionPath)
  const result = await checkPaymentLedger({ registrations: loadRegistrations(registrationPath), transactions })

  console.log(formatSummary(result))
  console.log('')
  for (const row of result.rows) console.log(JSON.stringify(row))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
