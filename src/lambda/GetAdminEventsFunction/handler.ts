import type { JsonDogEvent } from '../../types'

import { CONFIG } from '../config'
import { authorizeWithMemberOf } from '../lib/auth'
import { lambda } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const queryEvents = async (since?: string): Promise<JsonDogEvent[] | undefined> => {
  if (since) {
    const modifiedAfter = new Date(Number(since)).toISOString()
    const startSeason = Number(modifiedAfter.substring(0, 4))
    const endSeason = Number(new Date().toISOString().substring(0, 4))
    const result: JsonDogEvent[] = []

    for (let season = startSeason; season <= endSeason; season++) {
      const seasonEvents = await dynamoDB.query<JsonDogEvent>({
        key: 'season = :season AND modifiedAt > :modifiedAfter',
        values: { ':season': season.toString(), ':modifiedAfter': modifiedAfter },
        table: CONFIG.eventTable,
        index: 'gsiSeasonModifiedAt',
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
