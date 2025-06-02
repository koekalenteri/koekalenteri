import type { JsonUser, UserRole } from '../../types'

import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { authorize } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { setUserRole } from '../lib/user'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.userTable)

const setRoleLambda = lambda('setRole', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const origin = getOrigin(event)
  const item: { userId: string; orgId: string; role: UserRole | 'none' } = parseJSONWithFallback(event.body)

  if (!item?.orgId) {
    return response(400, 'Bad request', event)
  }

  if (user.id === item.userId) {
    console.warn('Trying to set own roles', { user, item })
    return response(403, 'Forbidden', event)
  }

  if (!user.admin && user.roles?.[item.orgId] !== 'admin') {
    console.warn('User does not have right to set role', { user, item })
    return response(403, 'Forbidden', event)
  }

  const existing = await dynamoDB.read<JsonUser>({ id: item.userId })

  if (!existing) {
    return response(404, 'Not found', event)
  }

  const saved = await setUserRole(existing, item.orgId, item.role, user.name || user.email, origin)

  return response(200, saved, event)
})

export default setRoleLambda
