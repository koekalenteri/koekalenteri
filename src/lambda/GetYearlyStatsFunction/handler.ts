import type { YearlyTotalStat } from '../../types/Stats'

import { lambda } from '../lib/lambda'
import { getAvailableYears, getDogHandlerBuckets, getYearlyTotalStats } from '../lib/stats'
import { response } from '../utils/response'

const getYearlyStatsLambda = lambda('getYearlyStatsLambda', async (event) => {
  // Optional year parameter (?year=2025)
  const yearParam = event.queryStringParameters?.year

  // If year is provided, return stats for that specific year
  if (yearParam && !isNaN(Number(yearParam))) {
    const year = Number(yearParam)
    const totals = await getYearlyTotalStats(year)
    const dogHandlerBuckets = await getDogHandlerBuckets(year)

    return response(200, { year, totals, dogHandlerBuckets }, event)
  }

  // Otherwise, return stats for all available years
  const years = await getAvailableYears()

  // Define the result type with proper typing
  interface YearStats {
    year: number
    totals: YearlyTotalStat[]
    dogHandlerBuckets: { bucket: string; count: number }[]
  }

  const result: { years: number[]; stats: YearStats[] } = {
    years,
    stats: [],
  }

  // Get stats for each year
  for (const year of years) {
    const totals = await getYearlyTotalStats(year)
    const dogHandlerBuckets = await getDogHandlerBuckets(year)

    result.stats.push({
      year,
      totals,
      dogHandlerBuckets,
    })
  }

  return response(200, result, event)
})

export default getYearlyStatsLambda
