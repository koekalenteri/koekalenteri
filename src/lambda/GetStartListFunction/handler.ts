import type { JsonPublicRegistration } from '../../types'
import { isStartListAvailable } from '../../lib/event'
import { START_LIST_VERSION_HEADER } from '../../lib/startList'
import { authorizeWithMemberOf } from '../lib/auth'
import { getEvent } from '../lib/event'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { buildPublicStartList } from '../lib/startList'

const getStartListLambda = lambda('getStartList', async (event) => {
  const preview = event.resource === '/admin/startlist/{eventId}'
  const auth = preview ? await authorizeWithMemberOf(event) : undefined

  const eventId = getParam(event, 'eventId')
  // Stamped before the reads, on the clock the live messages use, so the page can tell whether a
  // live update it already shows is newer than this answer (KOE-1516). The reads are consistent
  // for the same reason: a fetch a `stale` message asked for must see the write that sent it.
  const version = Date.now()
  const confirmedEvent = await getEvent(eventId, { consistent: true })
  if (auth && !auth.user.admin && !auth.memberOf.includes(confirmedEvent.organizer.id)) {
    throw new LambdaError(403, 'Forbidden')
  }

  const startListAvailable = preview || isStartListAvailable(confirmedEvent)
  let publicRegs: JsonPublicRegistration[] = []

  if (startListAvailable) {
    const items = await getRegistrationsByEventId(eventId, true)
    publicRegs = buildPublicStartList(confirmedEvent, items, preview)
  }

  return response(startListAvailable ? 200 : 404, publicRegs, event, {
    headers: { [START_LIST_VERSION_HEADER]: String(version) },
  })
})

export default getStartListLambda
