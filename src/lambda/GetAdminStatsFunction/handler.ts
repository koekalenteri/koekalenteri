import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { authorizeWithMemberOf } from '../lib/auth'
import { lambda, response } from '../lib/lambda'
import { getCapacityStats, getJudgeWorkload, getOrganizerStats } from '../lib/stats'

/**
 * Authorized counterpart to the public /stats route, and shaped the same way: the query
 * parameters pick which slice comes back. Everything here is scoped to organizers the caller
 * may see, which is why it cannot live on /stats — that route has no authorizer and caches
 * its responses publicly.
 *
 * ?judges=     -> { judgeWorkload } for that year -- not organizer-scoped, just authenticated
 * ?eventType=  -> { capacityStats } for that event type
 * otherwise    -> EventStatsItem[] for the organizer's events
 */
const getAdminStatsLambda = lambda(
  'getAdminStats',
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const auth = await authorizeWithMemberOf(event)
    if ('res' in auth && auth.res) {
      return auth.res
    }
    const { user, memberOf } = auth as { user: { admin?: boolean }; memberOf: string[] }

    const { eventType, organizerId, from, to, judges } = event.queryStringParameters ?? {}

    if (judges !== undefined) {
      // Strict digits only: Number() would accept '0x7E9' or '2025.5', which then query a key
      // like JUDGE#2025.5 that cannot exist, and a bare truthiness check would silently route
      // '?judges=0' to the organizer-stats response shape instead of failing it.
      if (!/^\d{4}$/.test(judges)) return response(400, 'Invalid year', event)
      const judgeWorkload = await getJudgeWorkload(Number(judges))
      return response(200, { judgeWorkload }, event)
    }

    // An explicit organizerId must be one the caller belongs to unless they're an admin.
    // Without one, an admin sees every organizer (undefined = no filter) and everyone else sees
    // exactly the organizers they belong to — which may be none, and an empty list must stay
    // empty rather than widening to "all".
    let organizerIds: string[] | undefined
    if (organizerId) {
      if (!user.admin && !memberOf.includes(organizerId)) {
        return response(403, 'Forbidden', event)
      }
      organizerIds = [organizerId]
    } else {
      organizerIds = user.admin ? undefined : memberOf
    }

    if (eventType) {
      const capacityStats = await getCapacityStats(eventType, organizerIds, from, to)
      return response(200, { capacityStats }, event)
    }

    const stats = await getOrganizerStats(organizerIds, from, to)
    return response(200, stats, event)
  }
)

export default getAdminStatsLambda
