import type { JsonConfirmedEvent } from '../../types'
import { authorizeWithMemberOf } from '../lib/auth'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getStartNumberLinkToken, startNumberLinkClasses } from '../lib/startNumberLink'

/**
 * The token an event secretary shares with a class secretary (KOE-1267). Computed on request rather
 * than stored, so revoking a class's links is nothing but bumping its `startNumberLinkVersions`
 * entry and asking again.
 */
const getStartNumberLinkLambda = lambda('getStartNumberLink', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const eventId = getParam(event, 'eventId')
  const eventClass = getParam(event, 'eventClass')

  const confirmedEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, eventId)
  if (!startNumberLinkClasses(confirmedEvent).includes(eventClass)) throw new LambdaError(404, 'not found')

  return response(200, { token: await getStartNumberLinkToken(eventId, confirmedEvent, eventClass) }, event)
})

export default getStartNumberLinkLambda
