import { authorize } from '../auth/api'
import { auditTrail } from '../lib/audit'
import { getParam, lambda, response } from '../lib/lambda'

export const getAuditTrailLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }
  const eventId = getParam(event, 'eventId')
  const id = getParam(event, 'id')
  const trail = await auditTrail(`${eventId}:${id}`)

  return response(200, trail, event)
}

export default lambda('getAuditTrail', getAuditTrailLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
