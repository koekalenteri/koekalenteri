import type { JsonUser, UserRole } from '../../types'
import { CONFIG } from '../config'
import { getFrontendOrigin } from '../lib/api-gw'
import { authorize } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { setUserRole } from '../lib/user'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.userTable)

const setRoleLambda = lambda('setRole', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  // The origin ends up in the access-granted email as a link, so it must never
  // be taken from the client-controlled Origin header as-is.
  const origin = getFrontendOrigin(event)
  const item: { userId: string; orgId: string; role: UserRole | 'none' } = parseJSONWithFallback(event.body)

  if (!item?.orgId) {
    return response(400, 'Bad request', event)
  }

  if (user.id === item.userId) {
    logger.warn('trying to set own roles', { orgId: item.orgId, role: item.role, userId: user.id })
    return response(403, 'Forbidden', event)
  }

  if (!user.admin && user.roles?.[item.orgId] !== 'admin') {
    logger.warn('user does not have right to set role', {
      orgId: item.orgId,
      role: item.role,
      targetUserId: item.userId,
      userId: user.id,
    })
    return response(403, 'Forbidden', event)
  }

  const existing = await dynamoDB.read<JsonUser>({ id: item.userId })

  if (!existing) {
    return response(404, 'Not found', event)
  }

  const saved = await setUserRole(existing, item.orgId, item.role, user.name || user.email, origin)
  await publishAdminDataInvalidation(['users'])

  return response(200, saved, event)
})

export default setRoleLambda
