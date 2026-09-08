import type { JsonDogEvent, JsonUser } from '../../types'
import { CONFIG } from '../config'
import { authorizeWithMemberOf } from '../lib/auth'
import { lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

/**
 * The seasons a superadmin's list walks back through: from next season down, stopping once two
 * seasons in a row hold nothing. Seasons are contiguous in practice, and the calendar has no data
 * before this floor.
 */
const EARLIEST_SEASON = 2020
const EMPTY_SEASONS_TO_STOP = 2

const querySeason = (season: number, updatedAfter?: string) =>
  dynamoDB.query<JsonDogEvent>(
    updatedAfter
      ? {
          index: 'gsiSeasonUpdatedAt',
          key: 'season = :season AND updatedAt >= :updatedAfter',
          table: CONFIG.eventTable,
          values: { ':season': season.toString(), ':updatedAfter': updatedAfter },
        }
      : {
          index: 'gsiSeasonStartDate',
          key: 'season = :season',
          table: CONFIG.eventTable,
          values: { ':season': season.toString() },
        }
  )

/** What changed since the client last asked, every season the change can be in. */
const queryChangedSince = async (since: string): Promise<JsonDogEvent[]> => {
  const updatedAfter = new Date(Number(since)).toISOString()
  const startSeason = Number(updatedAfter.substring(0, 4))
  const endSeason = Number(new Date().toISOString().substring(0, 4))
  const result: JsonDogEvent[] = []

  for (let season = startSeason; season <= endSeason; season++) {
    const seasonEvents = await querySeason(season, updatedAfter)
    if (seasonEvents) result.push(...seasonEvents)
  }

  return result
}

/** Every event there is, season by season, for the superadmin who may see them all. */
const queryAllSeasons = async (): Promise<JsonDogEvent[]> => {
  const result: JsonDogEvent[] = []
  let empty = 0

  for (
    let season = new Date().getFullYear() + 1;
    season >= EARLIEST_SEASON && empty < EMPTY_SEASONS_TO_STOP;
    season--
  ) {
    const seasonEvents = (await querySeason(season)) ?? []
    empty = seasonEvents.length ? 0 : empty + 1
    result.push(...seasonEvents)
  }

  return result
}

/**
 * A club's administrator reads the club's events through gsiOrganizerStartDate, one query per
 * club, and nothing of anyone else's (KOE-1341).
 */
const queryOrganizers = async (organizerIds: string[]): Promise<JsonDogEvent[]> => {
  const result: JsonDogEvent[] = []

  for (const organizerId of organizerIds) {
    const organizerEvents = await dynamoDB.query<JsonDogEvent>({
      index: 'gsiOrganizerStartDate',
      key: 'organizerId = :organizerId',
      table: CONFIG.eventTable,
      values: { ':organizerId': organizerId },
    })
    if (organizerEvents) result.push(...organizerEvents)
  }

  return result
}

const queryEvents = async (user: JsonUser, memberOf: string[], since?: string): Promise<JsonDogEvent[]> => {
  if (since) return queryChangedSince(since)
  if (user.admin) return queryAllSeasons()

  return queryOrganizers(memberOf)
}

const getAdminEventsLambda = lambda('getAdminEvents', async (event) => {
  const { user, memberOf } = await authorizeWithMemberOf(event)

  const items = await queryEvents(user, memberOf, event.queryStringParameters?.since)
  // The organizer queries already select by club; the season queries need the club filter here.
  const allowed = items.filter((item) => user.admin || memberOf.includes(item.organizer.id))

  return response(200, allowed, event)
})

export default getAdminEventsLambda
