import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { authorizeWithMemberOf } from '../lib/auth'
import { lambda, response } from '../lib/lambda'
import { getOrganizerStats } from '../lib/stats'

const getOrganizerEventStatsLambda = lambda(
  'getOrganizerEventStats',
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // Authenticate and authorize user
    const auth = await authorizeWithMemberOf(event)
    if ('res' in auth && auth.res) {
      return auth.res
    }
    const { user, memberOf } = auth as { user: any; memberOf: string[] }

    // Parse query params
    const from = event.queryStringParameters?.from
    const to = event.queryStringParameters?.to
    const organizerId = event.queryStringParameters?.organizerId

    // Get stats based on user role
    // If a specific organizerId is requested, it must be one the user is a member of (unless admin).
    // Otherwise: if admin, get all stats; if not, filter by memberOf.
    let organizerIds: string[] | undefined
    if (organizerId) {
      if (!user.admin && !memberOf.includes(organizerId)) {
        return response(403, 'Forbidden', event)
      }
      organizerIds = [organizerId]
    } else {
      organizerIds = user.admin ? undefined : memberOf
    }
    const stats = await getOrganizerStats(organizerIds, from, to)

    return response(200, stats, event)
  }
)

export default getOrganizerEventStatsLambda
