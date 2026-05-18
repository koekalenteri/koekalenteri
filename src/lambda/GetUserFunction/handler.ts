import { authorize } from '../auth/api'
import { lambda, response } from '../lib/lambda'

export const getUserLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event, true)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  return response(200, user, event)
}

export default lambda('getUser', getUserLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
