import { START_LIST_VERSION_HEADER } from '../../lib/startList'
import { authorizeWithMemberOf } from '../lib/auth'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { readPublishedStartList } from '../lib/startList'

const getStartListLambda = lambda('getStartList', async (event) => {
  const preview = event.resource === '/admin/startlist/{eventId}'
  const auth = preview ? await authorizeWithMemberOf(event) : undefined

  const eventId = getParam(event, 'eventId')
  // Read the same way as the live messages, and stamped with the same clock, so the page can tell
  // whether a live update it already shows is newer than this answer (KOE-1516).
  const { available, participants, version } = await readPublishedStartList(eventId, {
    checkEvent: (confirmedEvent) => {
      if (auth && !auth.user.admin && !auth.memberOf.includes(confirmedEvent.organizer.id)) {
        throw new LambdaError(403, 'Forbidden')
      }
    },
    preview,
  })

  return response(available ? 200 : 404, participants, event, {
    headers: { [START_LIST_VERSION_HEADER]: String(version) },
  })
})

export default getStartListLambda
