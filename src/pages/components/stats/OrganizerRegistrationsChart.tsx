import type { EventStatsItem } from '../../../types/Stats'
import { useTranslation } from 'react-i18next'
import { zonedDateString } from '../../../i18n/dates'
import { CATEGORICAL_CHART_COLORS } from './chartColors'
import StatsBarChart from './StatsBarChart'

interface Props {
  readonly items: EventStatsItem[]
}

const monthKey = (date?: Date): string | undefined => (date ? zonedDateString(date).slice(0, 7) : undefined)

export default function OrganizerRegistrationsChart({ items }: Props) {
  const { t } = useTranslation()

  const reserveByMonth = new Map<string, number>()
  const cancelledByMonth = new Map<string, number>()

  for (const item of items) {
    const key = monthKey(item.date)
    if (!key) continue
    reserveByMonth.set(key, (reserveByMonth.get(key) ?? 0) + (item.reserveRegistrations ?? 0))
    cancelledByMonth.set(key, (cancelledByMonth.get(key) ?? 0) + (item.cancelledRegistrations ?? 0))
  }

  const months = [...reserveByMonth.keys()].sort((a, b) => a.localeCompare(b))

  return (
    <StatsBarChart
      title={t('stats.admin.reserveCancelledTitle')}
      info={t('stats.admin.reserveCancelledTitleInfo')}
      emptyMessage={t('stats.noDataForYear')}
      isEmpty={months.length === 0}
      chartProps={{
        colors: [...CATEGORICAL_CHART_COLORS],
        series: [
          { data: months.map((month) => reserveByMonth.get(month) ?? 0), label: t('stats.admin.reserve') },
          {
            data: months.map((month) => cancelledByMonth.get(month) ?? 0),
            label: t('stats.admin.cancelledRegistrations'),
          },
        ],
        xAxis: [{ data: months, scaleType: 'band' }],
      }}
    />
  )
}
