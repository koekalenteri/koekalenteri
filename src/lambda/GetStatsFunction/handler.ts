import { ALL_EVENT_TYPES_FOR_CAPACITY } from '../../types/Stats'
import { lambda, response } from '../lib/lambda'
import {
  getAvailableYears,
  getBreedStartBreakdown,
  getCapacityStats,
  getCapacityStatsAllEventTypes,
  getDogHandlerBuckets,
  getDogsPerHandlerBuckets,
  getEventBreakdown,
  getRetentionStats,
  getYearlyBreakdown,
  getYearlyTotalStats,
} from '../lib/stats'

// Both partitions are only refreshed by the nightly RebuildStatsFunction, not on registration
// writes, so a short cache age doesn't buy freshness here — it just bounds how long a bad
// response could be served if the rebuild ever produced one.
const YEARLY_MAX_AGE = 300
const CAPACITY_MAX_AGE = 3600

async function getYearStats(year: number) {
  const [
    totals,
    dogHandlerBuckets,
    dogsPerHandlerBuckets,
    breedBreakdown,
    breedStartBreakdown,
    eventTypeBreakdown,
    classBreakdown,
    retention,
    eventBreakdown,
  ] = await Promise.all([
    getYearlyTotalStats(year),
    getDogHandlerBuckets(year),
    getDogsPerHandlerBuckets(year),
    getYearlyBreakdown(year, 'breed'),
    getBreedStartBreakdown(year),
    getYearlyBreakdown(year, 'eventType'),
    getYearlyBreakdown(year, 'class'),
    getRetentionStats(year),
    getEventBreakdown(year),
  ])

  // Omitted rather than zeroed for the earliest year: no comparison year exists, and a zero
  // would read as "nobody returned".
  return {
    breedBreakdown,
    breedStartBreakdown,
    classBreakdown,
    dogHandlerBuckets,
    dogsPerHandlerBuckets,
    eventTypeBreakdown,
    ...(retention && { retention }),
    eventBreakdown,
    totals,
    year,
  }
}

const getStatsLambda = lambda('getStatsLambda', async (event) => {
  // Optional year parameter (?year=2025) and, independently, an optional
  // eventType (+ from/to, yyyy-mm) parameter for monthly capacity stats.
  //
  // Deliberately no organizerId here: this route has no authorizer, so it only ever serves the
  // nationwide total. Per-organizer figures go through /admin/capacity-stats, which checks
  // admin-or-memberOf. Adding a filter here would publish one organizer's numbers to anyone,
  // and the public cache headers below would keep serving them for an hour.
  const { eventType, from, to, year: yearParam } = event.queryStringParameters ?? {}
  const yearRequested = !!yearParam && !Number.isNaN(Number(yearParam))

  const fetchCapacityStats = (type: string) =>
    type === ALL_EVENT_TYPES_FOR_CAPACITY
      ? getCapacityStatsAllEventTypes(from, to)
      : getCapacityStats(type, undefined, from, to)

  if (yearRequested) {
    const year = Number(yearParam)
    const [yearStats, capacityStats] = await Promise.all([
      getYearStats(year),
      eventType ? fetchCapacityStats(eventType) : undefined,
    ])
    return response(200, { ...yearStats, ...(capacityStats && { capacityStats }) }, event, {
      maxAge: YEARLY_MAX_AGE,
    })
  }

  // Capacity stats without a year stand alone: falling through would run getYearStats()
  // (four queries) for every available year just to have the caller discard the result.
  if (eventType) {
    const capacityStats = await fetchCapacityStats(eventType)
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
