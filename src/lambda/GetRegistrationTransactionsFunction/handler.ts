import { authorizeEvent } from '../lib/eventAuth'
import { getParam, lambda, response } from '../lib/lambda'
import { getTransactionsByReference, refreshTransactionStatusesFromPaytrail } from '../lib/payment'

const getRegistrationTransactionsLambda = lambda('getRegistrationTransactions', async (event) => {
  const { eventId } = await authorizeEvent(event, () => getParam(event, 'eventId'))

  const id = getParam(event, 'id')
  const reference = `${eventId}:${id}`
  const transactions = await getTransactionsByReference(reference)
  const refreshedTransactions = await refreshTransactionStatusesFromPaytrail(transactions)

  return response(200, refreshedTransactions, event)
})

export default getRegistrationTransactionsLambda
