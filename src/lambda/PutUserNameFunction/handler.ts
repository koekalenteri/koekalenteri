import type { JsonUser } from '../../types'

import { authorize, getAndUpdateUserByEmail } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'

const putUserNameLambda = lambda('putUserName', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const body: Partial<Pick<JsonUser, 'name'>> = parseJSONWithFallback(event.body)
  const name = String(body?.name ?? '').trim()

  if (!name) {
    return response(400, 'Bad request', event)
  }
  if (name.length > 200) {
    return response(400, 'Bad request', event)
  }

  const updated = await getAndUpdateUserByEmail(user.email, { name }, true)

  return response(200, updated, event)
})

export default putUserNameLambda
