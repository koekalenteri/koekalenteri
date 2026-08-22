import type { CapacityStatsEntry } from '../../../types/Stats'
import { useTranslation } from 'react-i18next'
import { ALL_CLASSES_ID } from './CapacityUtilizationChart'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'
import StatsBarChart from './StatsBarChart'

interface Props {
  readonly data: CapacityStatsEntry[]
  readonly classKey: string
}

/**
 * Share of registrations that were cancelled, per month.
 *
 * A rate rather than a count, and therefore its own chart: months with wildly different entry
 * numbers are only comparable once the count is divided out, and a percentage cannot share an
 * axis with the people-counts next to it.
 *
 * The denominator is starters + cancelled — everyone who registered and then either turned up or
 * withdrew. Reserve places are left out: someone who never got a place did not cancel one.
 */
const rateByMonth = (data: CapacityStatsEntry[]) => {
  const totals = new Map<string, { cancelled: number; month: string; registered: number }>()
  for (const entry of data) {
    const total = totals.get(entry.month) ?? { cancelled: 0, month: entry.month, registered: 0 }
    total.cancelled += entry.cancelledRegistrations
    total.registered += entry.starters + entry.cancelledRegistrations
    totals.set(entry.month, total)
  }
  return [...totals.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((total) => ({
      month: total.month,
      // A month with no registrations has no rate to speak of; 0 would read as "nobody cancelled".
      rate: total.registered > 0 ? Math.round((total.cancelled / total.registered) * 1000) / 10 : null,
    }))
}

export default function CancellationRateChart({ data, classKey }: Props) {
  const { t } = useTranslation()

  const entries = rateByMonth(classKey === ALL_CLASSES_ID ? data : data.filter((entry) => entry.class === classKey))

  return (
    <StatsBarChart
      title={t('stats.admin.cancellationRateTitle')}
      emptyMessage={t('stats.admin.noCapacityData')}
      isEmpty={entries.length === 0}
      chartProps={{
        colors: [SINGLE_SERIES_CHART_COLOR],
        series: [
          {
            data: entries.map((entry) => entry.rate),
            label: t('stats.admin.cancellationRate'),
            valueFormatter: (value: number | null) => (value === null ? '–' : `${value} %`),
          },
        ],
        // One series: the title already names it, so the legend box is redundant.
        slotProps: { legend: { hidden: true } },
        xAxis: [{ data: entries.map((entry) => entry.month), scaleType: 'band' }],
        yAxis: [{ valueFormatter: (value: number) => `${value} %` }],
      }}
    />
  )
}
