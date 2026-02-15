import type { JsonDogEvent } from '../../types'
import { CONFIG } from '../config'
import { authorizeWithMemberOf } from '../lib/auth'
import { lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const queryEvents = async (since?: string): Promise<JsonDogEvent[] | undefined> => {
  if (since) {
    const modifiedAfter = new Date(Number(since)).toISOString()
    const startSeason = Number(modifiedAfter.substring(0, 4))
    const endSeason = Number(new Date().toISOString().substring(0, 4))
    const result: JsonDogEvent[] = []

    for (let season = startSeason; season <= endSeason; season++) {
      const seasonEvents = await dynamoDB.query<JsonDogEvent>({
        index: 'gsiSeasonModifiedAt',
        key: 'season = :season AND modifiedAt > :modifiedAfter',
        table: CONFIG.eventTable,
        values: { ':modifiedAfter': modifiedAfter, ':season': season.toString() },
      })
      if (seasonEvents) result.push(...seasonEvents)
    }

    return result
  }

  return dynamoDB.readAll<JsonDogEvent>()
}

const getAdminEventsLambda = lambda('getAdminEvents', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const items = await queryEvents(event.queryStringParameters?.since)
  const allowed = items?.filter((item) => user.admin || memberOf.includes(item.organizer.id))

  return response(200, allowed, event)
})

export default getAdminEventsLambda
