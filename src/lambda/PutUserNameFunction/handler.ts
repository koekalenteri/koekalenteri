import type { JsonUser } from '../../types'
import { authorize, getAndUpdateUserByEmail } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, lambda, response } from '../lib/lambda'
import { publishAdminDataInvalidation } from '../lib/ws/actions'

const putUserNameLambda = lambda('putUserName', async (event) => {
  const user = await authorize(event)
  if (!user) {
    throw httpError(401, 'Unauthorized')
  }

  const body: Partial<Pick<JsonUser, 'name'>> = parseJSONWithFallback(event.body)
  const name = String(body?.name ?? '').trim()

  if (!name) {
    throw httpError(400, 'Bad request')
  }
  if (name.length > 200) {
    throw httpError(400, 'Bad request')
  }

  const updated = await getAndUpdateUserByEmail(user.email, { name }, true)
  await publishAdminDataInvalidation(['users'])

  return response(200, updated, event)
})

export default putUserNameLambda
