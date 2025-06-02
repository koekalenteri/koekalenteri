import type { JsonUser } from '../../types'

import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { lambda } from '../lib/lambda'
import { response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.userTable)

const setAdminLambda = lambda('setAdmin', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const item: { userId: string; admin: boolean } = parseJSONWithFallback(event.body)

  if (!item?.userId) {
    return response(400, 'Bad request', event)
  }

  if (user.id === item.userId || !user.admin) {
    return response(403, 'Forbidden', event)
  }

  const existing = await dynamoDB.read<JsonUser>({ id: item.userId })

  if (!existing) {
    return response(404, 'Not found', event)
  }

  await dynamoDB.update(
    { id: item.userId },
    {
      set: {
        admin: item.admin,
        modifiedAt: new Date().toISOString(),
        modifiedBy: user.name,
      },
    }
  )

  return response(200, { ...existing, ...item }, event)
})

export default setAdminLambda
