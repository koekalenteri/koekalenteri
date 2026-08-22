import type { CapacityStatsEntry } from '../../../types/Stats'
import { useTranslation } from 'react-i18next'
import { CATEGORICAL_CHART_COLORS } from './chartColors'
import StatsBarChart from './StatsBarChart'

/** Sentinel for the class filter's "all classes" option, summing every class into one series per month. */
export const ALL_CLASSES_ID = 'ALL'

interface Props {
  readonly data: CapacityStatsEntry[]
  readonly classKey: string
}

/**
 * Sums starters/places across every entry sharing a month, regardless of class or event type.
 * Always applied: with "all event types" selected the data holds one entry per month *per event
 * type*, so even a single-class view has duplicate months to collapse.
 */
const sumByMonth = (data: CapacityStatsEntry[]): { month: string; places: number; starters: number }[] => {
  const totals = new Map<string, { places: number; starters: number }>()
  for (const entry of data) {
    const total = totals.get(entry.month) ?? { places: 0, starters: 0 }
    total.places += entry.places
    total.starters += entry.starters
    totals.set(entry.month, total)
  }
  return [...totals.entries()]
    .map(([month, total]) => ({ month, ...total }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export default function CapacityUtilizationChart({ data, classKey }: Props) {
  const { t } = useTranslation()

  const entries = sumByMonth(classKey === ALL_CLASSES_ID ? data : data.filter((entry) => entry.class === classKey))

  return (
    <StatsBarChart
      title={t('stats.admin.capacityTitle')}
      emptyMessage={t('stats.admin.noCapacityData')}
      isEmpty={entries.length === 0}
      chartProps={{
        colors: [...CATEGORICAL_CHART_COLORS],
        series: [
          { data: entries.map((entry) => entry.starters), label: t('stats.admin.starters') },
          { data: entries.map((entry) => entry.places), label: t('stats.admin.places') },
        ],
        xAxis: [{ data: entries.map((entry) => entry.month), scaleType: 'band' }],
      }}
    />
  )
}
