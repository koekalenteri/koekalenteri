import type { JsonDogEvent } from '../../types'
import { currentYear, dayOf, TIME_ZONE, yearEnd, yearOf, yearStart } from '../../lib/day'
import { sanitizeDogEvent, storedDayKey } from '../../lib/event'
import { changedSince, collectionCursor, parseDateParam } from '../lib/incremental'
import { lambda, response } from '../lib/lambda'
import { readPublicSeasonEvents } from '../lib/repositories/eventRepository'

/**
 * Whether the event's days meet the range's, compared as Finnish days: the stored days are keys, or
 * instants on a row not yet migrated (KOE-1547). A row whose start has no day is left in, as the
 * season query that found it.
 */
function inRequestedRange(item: Pick<JsonDogEvent, 'startDate' | 'endDate'>, start?: Date, end?: Date) {
  const eventStart = storedDayKey(item.startDate)
  if (!eventStart) return true
  const eventEnd = storedDayKey(item.endDate) ?? eventStart
  if (start && eventEnd < dayOf(start, TIME_ZONE)) return false
  if (end && eventStart > dayOf(end, TIME_ZONE)) return false
  return true
}

function seasonsBetween(startYear: number, endYear: number): string[] {
  const seasons: string[] = []

  for (let year = startYear; year <= endYear; year++) {
    seasons.push(String(year))
  }

  return seasons
}

function getUpperBoundYear(end: Date | undefined, lowerBoundYear: number): number {
  if (end) return yearOf(end, TIME_ZONE)

  const thisYear = currentYear(TIME_ZONE)
  return lowerBoundYear === thisYear ? lowerBoundYear + 1 : lowerBoundYear
}

/**
 * The seasons the range spans, read by season and start date. A request with no range gets the
 * current season and the next, which is what the calendar's front page shows; nothing reads the
 * whole table any more (KOE-1341). Drafts are left out by the query rather than in memory: the
 * public list never needs them, so they are not carried over the wire from the database either.
 */
async function queryEventsForRange(start?: Date, end?: Date): Promise<JsonDogEvent[] | undefined> {
  const fallbackLowerBoundYear = end ? yearOf(end, TIME_ZONE) : currentYear(TIME_ZONE)
  const lowerBound = start ?? yearStart(fallbackLowerBoundYear, TIME_ZONE)
  const lowerBoundYear = yearOf(lowerBound, TIME_ZONE)
  const upperBoundYear = getUpperBoundYear(end, lowerBoundYear)
  const upperBound = end ?? yearEnd(upperBoundYear, TIME_ZONE)
  const seasons = seasonsBetween(lowerBoundYear, upperBoundYear)

  // The seasons are independent queries: asked together, the calendar waits for the slowest one
  // instead of their sum. Promise.all keeps the season order.
  const startsBy = dayOf(upperBound, TIME_ZONE)
  const perSeason = await Promise.all(seasons.map((season) => readPublicSeasonEvents(season, startsBy)))

  return perSeason.flatMap((seasonEvents) => seasonEvents ?? [])
}

/** How far the cursor trails the newest stamp, to catch rows stamped before they were committed */
const CURSOR_LOOKBACK_MS = 60 * 1000

const getEventsLambda = lambda('getEvents', async (event) => {
  const start = parseDateParam(event.queryStringParameters?.start)
  const end = parseDateParam(event.queryStringParameters?.end)
  const since = parseDateParam(event.queryStringParameters?.since)
  const items = await queryEventsForRange(start, end)
  let publicItems = items?.map((item) => sanitizeDogEvent(item)) ?? []

  if (since) {
    const rangedItems = publicItems.filter((item) => inRequestedRange(item, start, end))
    const { changed: events, unchanged, unchangedIds } = changedSince(rangedItems, since)

    // The cursor is the server's watermark for the next ask; the client's clock is no measure of
    // it (KOE-1501). It trails the newest stamp by CURSOR_LOOKBACK_MS and never falls behind
    // `since`: a row committed a moment late with an older stamp is then still asked for, and the
    // few rows delivered twice are merged by id. `unchangedIds` stays for the clients that read
    // only it.
    const cursor = Math.max(since.getTime(), collectionCursor(rangedItems, since) - CURSOR_LOOKBACK_MS)

    return response(200, { cursor, events, unchanged, unchangedIds }, event)
  }

  if (start || end) {
    publicItems = publicItems.filter((item) => inRequestedRange(item, start, end))
  }

  return response(200, publicItems, event)
})

export default getEventsLambda
