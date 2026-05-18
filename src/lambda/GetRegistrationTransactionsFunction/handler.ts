import { authorize } from '../auth/api'
import { getParam, lambda, response } from '../lib/lambda'
import { paymentTransactionRepository } from '../payment/repository'

export const getRegistrationTransactionsLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }
  const eventId = getParam(event, 'eventId')
  const id = getParam(event, 'id')
  const reference = `${eventId}:${id}`
  const transactions = await paymentTransactionRepository.listByReference(reference)

  return response(200, transactions, event)
}

export default lambda('getRegistrationTransactions', getRegistrationTransactionsLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
