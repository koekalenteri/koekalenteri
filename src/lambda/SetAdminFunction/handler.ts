import { authorize } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, lambda, response } from '../lib/lambda'
import { readUser, writeUserAdmin } from '../lib/repositories/userRepository'
import { publishAdminDataInvalidation } from '../lib/ws/actions'

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

  const existing = await readUser(item.userId)

  if (!existing) {
    throw httpError(404, 'Not found')
  }

  await writeUserAdmin(item.userId, item.admin, new Date().toISOString(), user.name)
  await publishAdminDataInvalidation(['users'])

  return response(200, { ...existing, ...item }, event)
})

export default setAdminLambda
