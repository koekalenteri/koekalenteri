import type { JsonUser } from '../../types'
import { getOrigin } from '../lib/api-gw'
import { authorize, getAndUpdateUserByEmail } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { setUserRole } from '../lib/user'
import { publishAdminDataInvalidation } from '../lib/ws/actions'

const userIsAdminFor = (user: JsonUser) =>
  Object.keys(user?.roles ?? {}).filter((orgId) => user?.roles?.[orgId] === 'admin')

const canSetRoleFor = (user: JsonUser, orgId: string) => user.admin || user.roles?.[orgId] === 'admin'

const putUserLambda = lambda('putUser', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }
  const adminFor = userIsAdminFor(user)
  if (!adminFor.length && !user?.admin) {
    return response(403, 'Forbidden', event)
  }
  const item: JsonUser = parseJSONWithFallback(event.body)

  for (const orgId of Object.keys(item.roles ?? [])) {
    if (!canSetRoleFor(user, orgId)) {
      console.warn('User does not have right to set role', { item, orgId, user })
      return response(403, 'Forbidden', event)
    }
  }

  let newUser = await getAndUpdateUserByEmail(item.email, { name: item.name })

  const origin = getOrigin(event)
  for (const orgId of Object.keys(item.roles ?? [])) {
    newUser = await setUserRole(newUser, orgId, item.roles?.[orgId] ?? 'none', user.name, origin)
  }

  await publishAdminDataInvalidation(['users'])

  return response(200, newUser, event)
})

export default putUserLambda
