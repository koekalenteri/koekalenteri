import type { JsonDogEvent } from '../../types'
import { formatDate, TIME_ZONE, zonedEndOfDay, zonedParseDate } from '../../i18n/dates'
import { sanitizeDogEvent } from '../../lib/event'
import { CONFIG } from '../config'
import { changedSince, collectionCursor, parseDateParam } from '../lib/incremental'
import { lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

function inRequestedRange(item: { startDate: string; endDate?: string }, start?: Date, end?: Date) {
  const eventStart = new Date(item.startDate)
  const eventEnd = item.endDate ? new Date(item.endDate) : eventStart
  if (start && eventEnd < start) return false
  if (end && eventStart > end) return false
  return true
}

function seasonsBetween(startYear: number, endYear: number): string[] {
  const seasons: string[] = []

  for (let year = startYear; year <= endYear; year++) {
    seasons.push(String(year))
  }

  return seasons
}

function zonedStartOfYear(year: number): Date {
  return zonedParseDate(`${year}-01-01`, TIME_ZONE)
}

function zonedEndOfYear(year: number): Date {
  return zonedEndOfDay(`${year}-12-31`, TIME_ZONE)
}

function zonedYear(date: Date): number {
  return Number(formatDate(date, 'yyyy', { timeZone: TIME_ZONE }))
}

function getUpperBoundYear(end: Date | undefined, lowerBoundYear: number): number {
  if (end) return zonedYear(end)

  const currentYear = zonedYear(new Date())
  return lowerBoundYear === currentYear ? lowerBoundYear + 1 : lowerBoundYear
}

/**
 * The seasons the range spans, read through gsiSeasonStartDate. A request with no range gets the
 * current season and the next, which is what the calendar's front page shows; nothing reads the
 * whole table any more (KOE-1341). Drafts are left out by the query rather than in memory: the
 * public list never needs them, so they are not carried over the wire from the database either.
 */
async function queryEventsForRange(start?: Date, end?: Date): Promise<JsonDogEvent[] | undefined> {
  const fallbackLowerBoundYear = zonedYear(end ?? new Date())
  const lowerBound = start ?? zonedStartOfYear(fallbackLowerBoundYear)
  const lowerBoundYear = zonedYear(lowerBound)
  const upperBoundYear = getUpperBoundYear(end, lowerBoundYear)
  const upperBound = end ?? zonedEndOfYear(upperBoundYear)
  const seasons = seasonsBetween(lowerBoundYear, upperBoundYear)

  // The seasons are independent queries: asked together, the calendar waits for the slowest one
  // instead of their sum. Promise.all keeps the season order.
  const perSeason = await Promise.all(
    seasons.map((season) =>
      dynamoDB.query<JsonDogEvent>({
        filterExpression: '#state <> :draft',
        index: 'gsiSeasonStartDate',
        key: 'season = :season AND startDate <= :endDate',
        names: { '#state': 'state' },
        table: CONFIG.eventTable,
        values: {
          ':draft': 'draft',
          ':endDate': upperBound.toISOString(),
          ':season': season,
        },
      })
    )
  )

  return perSeason.flatMap((seasonEvents) => seasonEvents ?? [])
}

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
    // it (KOE-1501). `unchangedIds` stays for the clients that read only it.
    return response(200, { cursor: collectionCursor(rangedItems, since), events, unchanged, unchangedIds }, event)
  }

  if (start || end) {
    publicItems = publicItems.filter((item) => inRequestedRange(item, start, end))
  }

  return response(200, publicItems, event)
})

export default getEventsLambda
