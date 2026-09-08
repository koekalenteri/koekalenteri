import { authorize } from '../lib/auth'
import { changedItemsSince, collectionCursor, parseDateParam } from '../lib/incremental'
import { httpError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { dedupeUsersByEmail, filterRelevantUsers, getAllUsers, userIsMemberOf } from '../lib/user'

const getUsersLambda = lambda('getUsers', async (event) => {
  const user = await authorize(event)
  if (!user) {
    throw httpError(401, 'Unauthorized')
  }
  const memberOf = userIsMemberOf(user)
  if (!memberOf.length && !user?.admin) {
    logger.error('user is not admin or member of any organization', { userId: user.id })
    throw httpError(403, 'Forbidden')
  }
  const users = await getAllUsers()

  const relevant = filterRelevantUsers(users, user, memberOf)
  const deduped = dedupeUsersByEmail(relevant)
  const since = parseDateParam(event.queryStringParameters?.since)

  if (since) {
    const allDeduped = dedupeUsersByEmail(users)
    const relevantById = new Map(deduped.map((item) => [item.id, item]))
    const changed = changedItemsSince(allDeduped, since)

    return response(
      200,
      {
        cursor: collectionCursor(allDeduped, since),
        deletedIds: changed.filter((item) => !relevantById.has(item.id)).map((item) => item.id),
        items: changed.flatMap((item) => {
          const relevantItem = relevantById.get(item.id)
          return relevantItem ? [relevantItem] : []
        }),
      },
      event
    )
  }

  return response(200, deduped, event)
})

export default getUsersLambda
