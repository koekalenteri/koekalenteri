import type { EventStatsItem, YearlyStatTypes, YearlyTotalStat } from '../../types/Stats'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.eventStatsTable)

function buildDateRangeFilters(from?: string, to?: string) {
  const filterExpressions: string[] = []
  const expressionValues: Record<string, any> = {}

  if (from) {
    filterExpressions.push('SK >= :from')
    expressionValues[':from'] = from
  }

  if (to) {
    filterExpressions.push('SK <= :to')
    expressionValues[':to'] = to
  }

  return { expressionValues, filterExpressions }
}

async function queryOrganizerStats(
  organizerId: string,
  from?: string,
  to?: string
): Promise<Required<EventStatsItem>[]> {
  const expressionNames: Record<string, string> = { '#pk': 'PK' }
  const expressionValues: Record<string, any> = { ':pk': `ORG#${organizerId}` }
  const { filterExpressions, expressionValues: dateValues } = buildDateRangeFilters(from, to)
  Object.assign(expressionValues, dateValues)

  const items = await dynamoDB.query<Required<EventStatsItem>>({
    filterExpression: filterExpressions.length > 0 ? filterExpressions.join(' AND ') : undefined,
    key: '#pk = :pk',
    names: expressionNames,
    values: expressionValues,
  })

  return items || []
}

async function queryAllOrganizerStats(from?: string, to?: string): Promise<Required<EventStatsItem>[]> {
  const filterExpressions: string[] = ['begins_with(#pk, :orgPrefix)']
  const expressionNames: Record<string, string> = { '#pk': 'PK' }
  const expressionValues: Record<string, any> = { ':orgPrefix': 'ORG#' }
  const { filterExpressions: dateFilters, expressionValues: dateValues } = buildDateRangeFilters(from, to)
  filterExpressions.push(...dateFilters)
  Object.assign(expressionValues, dateValues)

  const items = await dynamoDB.readAll<Required<EventStatsItem>>(
    undefined,
    filterExpressions.join(' AND '),
    expressionValues,
    expressionNames
  )
  return items || []
}

export async function getOrganizerStats(
  organizerIds?: string[],
  from?: string,
  to?: string
): Promise<EventStatsItem[]> {
  let allStats: Required<EventStatsItem>[] = []
  if (organizerIds?.length) {
    for (const organizerId of organizerIds) {
      const items = await queryOrganizerStats(organizerId, from, to)
      allStats = [...allStats, ...items]
    }
  } else {
    allStats = await queryAllOrganizerStats(from, to)
  }

  allStats.sort((a, b) => a.date.localeCompare(b.date))
  return allStats
}

export async function getYearlyTotalStats(year: number): Promise<YearlyTotalStat[]> {
  const items = await dynamoDB.query<{ SK: string; count: number }>({
    key: 'PK = :pk',
    values: { ':pk': `TOTALS#${year}` },
  })
  return (items || []).map((item) => ({ count: item.count, type: item.SK as YearlyStatTypes, year }))
}

export async function getDogHandlerBuckets(year: number): Promise<{ bucket: string; count: number }[]> {
  const items = await dynamoDB.query<{ SK: string; count: number }>({
    key: 'PK = :pk',
    values: { ':pk': `BUCKETS#${year}#dog#handler` },
  })
  return (items || []).map((item) => ({ bucket: item.SK, count: item.count }))
}

export async function getAvailableYears(): Promise<number[]> {
  const items = await dynamoDB.query<{ SK: string }>({ key: 'PK = :pk', values: { ':pk': 'YEARS' } })
  if (!items?.length) return []
  return items.map((item) => Number.parseInt(item.SK, 10)).sort((a, b) => a - b)
}
