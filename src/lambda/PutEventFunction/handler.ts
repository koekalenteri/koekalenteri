import type { JsonConfirmedEvent } from '../../types'
import { authorize } from '../auth/api'
import { saveEvent } from '../event/actions'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'

export const putEventLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const timestamp = new Date().toISOString()

  const item: Partial<JsonConfirmedEvent> = parseJSONWithFallback(event.body)

  try {
    const result = await saveEvent({ item, timestamp, user })
    return response(200, result.event, event)
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return response(403, 'Forbidden', event)
    }
    throw error
  }
}

export default lambda('putEvent', putEventLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
