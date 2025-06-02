import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { authorizeWithMemberOf } from '../lib/auth'
import { lambda } from '../lib/lambda'
import { response } from '../lib/lambda'
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

    // Get stats based on user role
    // If admin, get all stats; otherwise, filter by memberOf
    const organizerIds = user.admin ? undefined : memberOf
    const stats = await getOrganizerStats(organizerIds, from, to)

    return response(200, stats, event)
  }
)

export default getOrganizerEventStatsLambda
