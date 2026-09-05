import type { JsonPublicRegistration } from '../../types'
import { isStartListAvailable } from '../../lib/event'
import { authorizeWithMemberOf } from '../lib/auth'
import { getEvent } from '../lib/event'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { buildPublicStartList } from '../lib/startList'

const getStartListLambda = lambda('getStartList', async (event) => {
  const preview = event.resource === '/admin/startlist/{eventId}'
  const auth = preview ? await authorizeWithMemberOf(event) : undefined
  if (auth?.res) {
    return auth.res
  }

  const eventId = getParam(event, 'eventId')
  const confirmedEvent = await getEvent(eventId)
  if (auth?.user && !auth.user.admin && !auth.memberOf?.includes(confirmedEvent.organizer.id)) {
    throw new LambdaError(403, 'Forbidden')
  }

  const startListAvailable = preview || isStartListAvailable(confirmedEvent)
  let publicRegs: JsonPublicRegistration[] = []

  if (startListAvailable) {
    const items = (await getRegistrationsByEventId(eventId)) ?? []
    publicRegs = buildPublicStartList(confirmedEvent, items, preview)
  }

  return response(startListAvailable ? 200 : 404, publicRegs, event)
})

export default getStartListLambda
