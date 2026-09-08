import { auditTrail } from '../lib/audit'
import { authorizeEvent } from '../lib/eventAuth'
import { getParam, lambda, response } from '../lib/lambda'

const getAuditTrailLambda = lambda('getAuditTrail', async (event) => {
  const { eventId } = await authorizeEvent(event, () => getParam(event, 'eventId'))

  const id = getParam(event, 'id')
  const trail = await auditTrail(`${eventId}:${id}`)

  return response(200, trail, event)
})

export default getAuditTrailLambda
