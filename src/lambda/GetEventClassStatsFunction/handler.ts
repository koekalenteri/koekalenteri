import { authorizeAdmin } from '../lib/auth'
import { httpError, lambda, response } from '../lib/lambda'
import { getEventClassStats } from '../lib/stats/eventClassStats'

/**
 * The season's trials class by class, for the application administrator to download (KOE-1595):
 * `?season=YYYY`, a Finnish season year as the events are filed under.
 */
const getEventClassStatsLambda = lambda('getEventClassStats', async (event) => {
  await authorizeAdmin(event)

  const season = event.queryStringParameters?.season
  // Strict digits only: Number() would accept '0x7E9' or '2025.5', a season no event is filed under.
  if (!season || !/^\d{4}$/.test(season)) throw httpError(400, 'Invalid season')

  return response(200, await getEventClassStats(Number(season)), event)
})

export default getEventClassStatsLambda
