import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { JsonObject } from '../../types'

import { CONFIG } from '../config'
import { authorizeWithMemberOf } from '../lib/auth'
import { lambda } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.organizerEventStatsTable)

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

    // Read all stats and filter by organizer membership
    const items = (await dynamoDB.readAll<JsonObject>()) || []
    let stats = items as any[]
    if (!user.admin) {
      stats = stats.filter((s) => memberOf.includes(s.organizerId))
    }

    // Apply optional date filters
    if (from) {
      stats = stats.filter((s) => s.eventStartDate >= from)
    }
    if (to) {
      stats = stats.filter((s) => s.eventEndDate <= to)
    }

    return response(200, stats, event)
  }
)

export default getOrganizerEventStatsLambda
