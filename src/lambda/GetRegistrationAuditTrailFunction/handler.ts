import { auditTrail } from '../lib/audit'
import { authorize } from '../lib/auth'
import { getParam, lambda } from '../lib/lambda'
import { response } from '../utils/response'

const getAuditTrailLambda = lambda('getAuditTrail', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }
  const eventId = getParam(event, 'eventId')
  const id = getParam(event, 'id')
  const trail = await auditTrail(`${eventId}:${id}`)

  return response(200, trail, event)
})

export default getAuditTrailLambda
