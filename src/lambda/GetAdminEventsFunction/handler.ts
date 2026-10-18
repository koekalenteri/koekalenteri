import type { JsonDogEvent, JsonUser } from '../../types'
import { currentYear, TIME_ZONE, yearOf } from '../../lib/day'
import { authorizeWithMemberOf } from '../lib/auth'
import { parseDateParam } from '../lib/incremental'
import { httpError, lambda, response } from '../lib/lambda'
import {
  readOrganizerEvents,
  readSeasonEvents,
  readSeasonEventsUpdatedSince,
} from '../lib/repositories/eventRepository'

/**
 * The seasons a superadmin's list walks back through: from next season down, stopping once two
 * seasons in a row hold nothing. Seasons are contiguous in practice, and the calendar has no data
 * before this floor.
 */
const EARLIEST_SEASON = 2020
const EMPTY_SEASONS_TO_STOP = 2

const querySeason = (season: number, updatedAfter?: string) =>
  updatedAfter ? readSeasonEventsUpdatedSince(season, updatedAfter) : readSeasonEvents(season)

/** What changed since the client last asked, every season the change can be in. */
const queryChangedSince = async (since: string): Promise<JsonDogEvent[]> => {
  const sinceInstant = parseDateParam(since)
  if (!sinceInstant) throw httpError(400, 'Bad request: since must be a valid time')
  const updatedAfter = sinceInstant.toISOString()
  // The seasons are Finnish years, as the events' are (GetEventsFunction).
  const startSeason = yearOf(sinceInstant, TIME_ZONE)
  const endSeason = currentYear(TIME_ZONE)
  const seasons = Array.from({ length: endSeason - startSeason + 1 }, (_, index) => startSeason + index)

  const perSeason = await Promise.all(seasons.map((season) => querySeason(season, updatedAfter)))
  return perSeason.flatMap((seasonEvents) => seasonEvents ?? [])
}

/**
 * Every event there is, season by season, for the superadmin who may see them all. Each season is
 * read only once the one after it has answered: whether to go on depends on what it held.
 */
const queryAllSeasons = async (): Promise<JsonDogEvent[]> => {
  const walkBack = async (season: number, empty: number): Promise<JsonDogEvent[]> => {
    if (season < EARLIEST_SEASON || empty >= EMPTY_SEASONS_TO_STOP) return []
    const seasonEvents = (await querySeason(season)) ?? []
    const earlier = await walkBack(season - 1, seasonEvents.length ? 0 : empty + 1)
    return [...seasonEvents, ...earlier]
  }

  return walkBack(currentYear(TIME_ZONE) + 1, 0)
}

/**
 * A club's administrator reads the club's events by organizer, one query per club, and nothing of
 * anyone else's (KOE-1341).
 */
const queryOrganizers = async (organizerIds: string[]): Promise<JsonDogEvent[]> => {
  const perOrganizer = await Promise.all(organizerIds.map((organizerId) => readOrganizerEvents(organizerId)))
  return perOrganizer.flatMap((organizerEvents) => organizerEvents ?? [])
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
