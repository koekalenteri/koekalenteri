import type { JsonDuplicatePaymentEntry, JsonRegistration } from '../../types'
import { getDuplicatePaymentRemainder } from '../../lib/payment'
import { isDuplicatePayment } from '../../lib/registration'
import { mapWithConcurrency } from '../../lib/utils'
import { authorizeEvent } from '../lib/eventAuth'
import { getParam, lambda, response } from '../lib/lambda'
import { refundRegistrationResponse } from '../lib/registration'
import { readEventRegistrations } from '../lib/repositories/registrationRepository'
import { readTransactionsByReference } from '../lib/repositories/transactionRepository'

/** How many rows' transactions are read at once; there are next to none on an event. */
const TRANSACTION_READ_CONCURRENCY = 5

const toEntry = async (registration: JsonRegistration): Promise<JsonDuplicatePaymentEntry | undefined> => {
  const transactions = (await readTransactionsByReference(`${registration.eventId}:${registration.id}`)) ?? []
  const amount = getDuplicatePaymentRemainder(transactions)
  if (amount <= 0) return undefined

  // The stamps are ISO instants, which sort as text; a later charge is the one that is news.
  const [duplicatePaymentAt] = transactions
    .flatMap((transaction) => (transaction.duplicatePaymentAt ? [transaction.duplicatePaymentAt] : []))
    .sort((a, b) => b.localeCompare(a))

  return { amount, duplicatePaymentAt, registration: refundRegistrationResponse(registration) }
}

/**
 * The event's payments charged twice that have not gone back (KOE-1693). Such a row stays unfinished
 * and off `GetAdminRegistrationsFunction`'s list, so that nothing reading the entries sees it.
 */
const getDuplicatePaymentsLambda = lambda('getDuplicatePayments', async (event) => {
  const { eventId } = await authorizeEvent(event, () => getParam(event, 'eventId'))

  const duplicates = (await readEventRegistrations(eventId)).filter(isDuplicatePayment)
  const entries = await mapWithConcurrency(duplicates, TRANSACTION_READ_CONCURRENCY, toEntry)

  return response<JsonDuplicatePaymentEntry[]>(
    200,
    entries.filter((entry) => entry !== undefined),
    event
  )
})

export default getDuplicatePaymentsLambda
