import type { JsonDogEvent } from '../../types'
import { authorizeWithMemberOf } from '../auth/api'
import { eventRepository } from '../event/repository'
import { lambda, response } from '../lib/lambda'

const queryEvents = async (since?: string): Promise<JsonDogEvent[] | undefined> => {
  if (since) {
    const modifiedAfter = new Date(Number(since)).toISOString()
    const startSeason = Number(modifiedAfter.substring(0, 4))
    const endSeason = Number(new Date().toISOString().substring(0, 4))
    const result: JsonDogEvent[] = []

    for (let season = startSeason; season <= endSeason; season++) {
      const seasonEvents = await eventRepository.listBySeasonModifiedAfter({
        modifiedAfterIso: modifiedAfter,
        season: season.toString(),
      })
      if (seasonEvents) result.push(...seasonEvents)
    }

    return result
  }

  return eventRepository.listAll()
}

export const getAdminEventsLambda = async (event: Parameters<typeof response>[2]) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const items = await queryEvents(event.queryStringParameters?.since)
  const allowed = items?.filter((item) => user.admin || memberOf.includes(item.organizer.id))

  return response(200, allowed, event)
}

export default lambda('getAdminEvents', getAdminEventsLambda)
