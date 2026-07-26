import { auditTrail, eventAuditKey } from '../lib/audit'
import { authorizeEvent } from '../lib/eventAuth'
import { getParam, lambda, response } from '../lib/lambda'

const getEventAuditTrailLambda = lambda('getEventAuditTrail', async (event) => {
  const { eventId: id, res } = await authorizeEvent(event, () => getParam(event, 'id'))

  if (res) return res

  const trail = await auditTrail(eventAuditKey({ id }))

  return response(200, trail, event)
})

export default getEventAuditTrailLambda
