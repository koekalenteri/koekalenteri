import { lambda, response } from '../lib/lambda'
import {
  getAvailableYears,
  getCapacityStats,
  getDogHandlerBuckets,
  getYearlyBreakdown,
  getYearlyTotalStats,
} from '../lib/stats'

// Both partitions are only refreshed by the nightly RebuildStatsFunction, not on registration
// writes, so a short cache age doesn't buy freshness here — it just bounds how long a bad
// response could be served if the rebuild ever produced one.
const YEARLY_MAX_AGE = 300
const CAPACITY_MAX_AGE = 3600

async function getYearStats(year: number) {
  const [totals, dogHandlerBuckets, breedBreakdown, eventTypeBreakdown] = await Promise.all([
    getYearlyTotalStats(year),
    getDogHandlerBuckets(year),
    getYearlyBreakdown(year, 'breed'),
    getYearlyBreakdown(year, 'eventType'),
  ])

  return { breedBreakdown, dogHandlerBuckets, eventTypeBreakdown, totals, year }
}

const getStatsLambda = lambda('getStatsLambda', async (event) => {
  // Optional year parameter (?year=2025) and, independently, an optional
  // eventType (+ from/to, yyyy-mm) parameter for monthly capacity stats.
  const { eventType, from, to, year: yearParam } = event.queryStringParameters ?? {}
  const yearRequested = !!yearParam && !Number.isNaN(Number(yearParam))

  if (yearRequested) {
    const year = Number(yearParam)
    const [yearStats, capacityStats] = await Promise.all([
      getYearStats(year),
      eventType ? getCapacityStats(eventType, from, to) : undefined,
    ])
    return response(200, { ...yearStats, ...(capacityStats && { capacityStats }) }, event, {
      maxAge: YEARLY_MAX_AGE,
    })
  }

  // Capacity stats without a year stand alone: falling through would run getYearStats()
  // (four queries) for every available year just to have the caller discard the result.
  if (eventType) {
    const capacityStats = await getCapacityStats(eventType, from, to)
    return response(200, { capacityStats }, event, { maxAge: CAPACITY_MAX_AGE })
  }

  // Otherwise, return stats for all available years
  const years = await getAvailableYears()

  type YearStats = Awaited<ReturnType<typeof getYearStats>>

  // Each year's four queries already run in parallel; running the years in parallel too
  // collapses N sequential round-trip batches into one. Promise.all preserves order.
  const result: { years: number[]; stats: YearStats[] } = {
    stats: await Promise.all(years.map((year) => getYearStats(year))),
    years,
  }

  return response(200, result, event, { maxAge: YEARLY_MAX_AGE })
})

export default getStatsLambda
