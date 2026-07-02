import { auditTrail, eventAuditKey } from '../lib/audit'
import { authorizeWithMemberOf } from '../lib/auth'
import { getEvent } from '../lib/event'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'

const getEventAuditTrailLambda = lambda('getEventAuditTrail', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const id = getParam(event, 'id')
  const item = await getEvent(id)

  if (!user.admin && !memberOf.includes(item.organizer.id)) {
    throw new LambdaError(403, 'Forbidden')
  }

  const trail = await auditTrail(eventAuditKey({ id }))

  return response(200, trail, event)
})

export default getEventAuditTrailLambda
