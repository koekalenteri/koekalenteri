import type { JsonUser } from '../../types'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, lambda, response } from '../lib/lambda'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.userTable)

const setAdminLambda = lambda('setAdmin', async (event) => {
  const user = await authorize(event)
  if (!user) {
    throw httpError(401, 'Unauthorized')
  }

  const item: { userId: string; admin: boolean } = parseJSONWithFallback(event.body)

  if (!item?.userId) {
    throw httpError(400, 'Bad request')
  }

  if (user.id === item.userId || !user.admin) {
    throw httpError(403, 'Forbidden')
  }

  const existing = await dynamoDB.read<JsonUser>({ id: item.userId })

  if (!existing) {
    throw httpError(404, 'Not found')
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
  await publishAdminDataInvalidation(['users'])

  return response(200, { ...existing, ...item }, event)
})

export default setAdminLambda
