import { authorize } from '../lib/auth'
import { getParam, lambda, response } from '../lib/lambda'
import { getTransactionsByReference } from '../lib/payment'

const getRegistrationTransactionsLambda = lambda('getRegistrationTransactions', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }
  const eventId = getParam(event, 'eventId')
  const id = getParam(event, 'id')
  const reference = `${eventId}:${id}`
  const transactions = await getTransactionsByReference(reference)

  return response(200, transactions, event)
})

export default getRegistrationTransactionsLambda
