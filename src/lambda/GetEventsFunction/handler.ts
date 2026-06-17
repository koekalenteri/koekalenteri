import type { JsonDogEvent } from '../../types'
import { formatDate, TIME_ZONE, zonedEndOfDay, zonedParseDate } from '../../i18n/dates'
import { sanitizeDogEvent } from '../../lib/event'
import { CONFIG } from '../config'
import { changedSince, parseDateParam } from '../lib/incremental'
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

async function queryEventsForRange(start?: Date, end?: Date): Promise<JsonDogEvent[] | undefined> {
  if (!start && !end) {
    return dynamoDB.readAll<JsonDogEvent>()
  }

  const fallbackLowerBoundYear = zonedYear(end ?? new Date())
  const lowerBound = start ?? zonedStartOfYear(fallbackLowerBoundYear)
  const lowerBoundYear = zonedYear(lowerBound)
  const upperBoundYear = getUpperBoundYear(end, lowerBoundYear)
  const upperBound = end ?? zonedEndOfYear(upperBoundYear)
  const seasons = seasonsBetween(lowerBoundYear, upperBoundYear)
  const result: JsonDogEvent[] = []

  for (const season of seasons) {
    const seasonEvents = await dynamoDB.query<JsonDogEvent>({
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      table: CONFIG.eventTable,
      values: {
        ':endDate': upperBound.toISOString(),
        ':season': season,
      },
    })

    if (seasonEvents) result.push(...seasonEvents)
  }

  return result
}

const getEventsLambda = lambda('getEvents', async (event) => {
  const start = parseDateParam(event.queryStringParameters?.start)
  const end = parseDateParam(event.queryStringParameters?.end)
  const since = parseDateParam(event.queryStringParameters?.since)
  const items = await queryEventsForRange(start, end)
  let publicItems = items?.filter((item) => item.state !== 'draft').map((item) => sanitizeDogEvent(item)) ?? []

  if (since) {
    const rangedItems = publicItems.filter((item) => inRequestedRange(item, start, end))
    const { changed: changedEvents, unchangedIds } = changedSince(rangedItems, since)

    return response(200, { events: changedEvents, unchangedIds }, event)
  }

  if (start || end) {
    publicItems = publicItems.filter((item) => inRequestedRange(item, start, end))
  }

  return response(200, publicItems, event)
})

export default getEventsLambda
