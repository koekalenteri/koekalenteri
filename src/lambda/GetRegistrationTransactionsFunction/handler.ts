import { authorizeEvent } from '../lib/eventAuth'
import { getParam, lambda, response } from '../lib/lambda'
import { getTransactionsByReference, refreshTransactionStatusesFromPaytrail } from '../lib/payment'
import { getRegistration } from '../lib/registration'
import { publishCancelledRegistration } from '../lib/ws/actions'

const getRegistrationTransactionsLambda = lambda('getRegistrationTransactions', async (event) => {
  const { eventId } = await authorizeEvent(event, () => getParam(event, 'eventId'))

  const id = getParam(event, 'id')
  const reference = `${eventId}:${id}`
  const transactions = await getTransactionsByReference(reference)
  const registration = await getRegistration(eventId, id)
  const { cancelled, transactions: refreshedTransactions } = await refreshTransactionStatusesFromPaytrail(
    transactions,
    registration
  )
  await Promise.all(cancelled.map((settled) => publishCancelledRegistration(settled)))

  return response(200, refreshedTransactions, event)
})

export default getRegistrationTransactionsLambda
