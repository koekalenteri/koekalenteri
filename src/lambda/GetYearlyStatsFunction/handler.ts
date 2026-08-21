import type { YearlyBreakdownEntry, YearlyTotalStat } from '../../types/Stats'
import { lambda, response } from '../lib/lambda'
import { getAvailableYears, getDogHandlerBuckets, getYearlyBreakdown, getYearlyTotalStats } from '../lib/stats'

async function getYearStats(year: number) {
  const [totals, dogHandlerBuckets, breedBreakdown, eventTypeBreakdown] = await Promise.all([
    getYearlyTotalStats(year),
    getDogHandlerBuckets(year),
    getYearlyBreakdown(year, 'breed'),
    getYearlyBreakdown(year, 'eventType'),
  ])

  return { breedBreakdown, dogHandlerBuckets, eventTypeBreakdown, totals, year }
}

const getYearlyStatsLambda = lambda('getYearlyStatsLambda', async (event) => {
  // Optional year parameter (?year=2025)
  const yearParam = event.queryStringParameters?.year

  // If year is provided, return stats for that specific year
  if (yearParam && !Number.isNaN(Number(yearParam))) {
    const year = Number(yearParam)
    return response(200, await getYearStats(year), event)
  }

  // Otherwise, return stats for all available years
  const years = await getAvailableYears()

  // Define the result type with proper typing
  interface YearStats {
    year: number
    totals: YearlyTotalStat[]
    dogHandlerBuckets: { bucket: string; count: number }[]
    breedBreakdown: YearlyBreakdownEntry[]
    eventTypeBreakdown: YearlyBreakdownEntry[]
  }

  const result: { years: number[]; stats: YearStats[] } = {
    stats: [],
    years,
  }

  // Get stats for each year
  for (const year of years) {
    result.stats.push(await getYearStats(year))
  }

  return response(200, result, event)
})

export default getYearlyStatsLambda
