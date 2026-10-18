import { authorizeEvent } from '../lib/eventAuth'
import { getParam, lambda, response } from '../lib/lambda'
import { publishCancelledRegistration, refreshTransactionStatusesFromPaytrail } from '../lib/payment'
import { getRegistration } from '../lib/registration'
import { readTransactionsByReference } from '../lib/repositories/transactionRepository'

const getRegistrationTransactionsLambda = lambda('getRegistrationTransactions', async (event) => {
  const { eventId } = await authorizeEvent(event, () => getParam(event, 'eventId'))

  const id = getParam(event, 'id')
  const reference = `${eventId}:${id}`
  const transactions = await readTransactionsByReference(reference)
  const registration = await getRegistration(eventId, id)
  const { cancelled, transactions: refreshedTransactions } = await refreshTransactionStatusesFromPaytrail(
    transactions,
    registration
  )
  await Promise.all(cancelled.map((settled) => publishCancelledRegistration(settled)))

  return response(200, refreshedTransactions, event)
})

export default getRegistrationTransactionsLambda
