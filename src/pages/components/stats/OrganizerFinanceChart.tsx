import type { EventStatsItem } from '../../../types/Stats'
import { useTranslation } from 'react-i18next'
import { zonedDateString } from '../../../i18n/dates'
import { CATEGORICAL_CHART_COLORS } from './chartColors'
import StatsBarChart from './StatsBarChart'

interface Props {
  readonly items: EventStatsItem[]
}

const monthKey = (date?: Date): string | undefined => (date ? zonedDateString(date).slice(0, 7) : undefined)

export default function OrganizerFinanceChart({ items }: Props) {
  const { t } = useTranslation()

  const paidByMonth = new Map<string, number>()
  const refundedByMonth = new Map<string, number>()

  for (const item of items) {
    const key = monthKey(item.date)
    if (!key) continue
    paidByMonth.set(key, (paidByMonth.get(key) ?? 0) + (item.paidAmount ?? 0))
    refundedByMonth.set(key, (refundedByMonth.get(key) ?? 0) + (item.refundedAmount ?? 0))
  }

  const months = [...paidByMonth.keys()].sort((a, b) => a.localeCompare(b))

  return (
    <StatsBarChart
      title={t('stats.admin.title')}
      emptyMessage={t('stats.noDataForYear')}
      isEmpty={months.length === 0}
      chartProps={{
        colors: [...CATEGORICAL_CHART_COLORS],
        series: [
          { data: months.map((month) => paidByMonth.get(month) ?? 0), label: t('stats.admin.paidAmount') },
          { data: months.map((month) => refundedByMonth.get(month) ?? 0), label: t('stats.admin.refundedAmount') },
        ],
        xAxis: [{ data: months, scaleType: 'band' }],
      }}
    />
  )
}
