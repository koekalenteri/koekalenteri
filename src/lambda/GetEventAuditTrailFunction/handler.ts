import { auditTrail, eventAuditKey } from '../lib/audit'
import { authorizeEvent } from '../lib/eventAuth'
import { getParam, lambda, response } from '../lib/lambda'

const getEventAuditTrailLambda = lambda('getEventAuditTrail', async (event) => {
  const { eventId: id } = await authorizeEvent(event, () => getParam(event, 'id'))

  const trail = await auditTrail(eventAuditKey({ id }))

  return response(200, trail, event)
})

export default getEventAuditTrailLambda
