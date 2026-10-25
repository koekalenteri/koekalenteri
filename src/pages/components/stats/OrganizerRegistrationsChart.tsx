import type { EventStatsItem } from '@/types/Stats'
import { useTranslation } from 'react-i18next'
import { dayOf, monthKeyOf, TIME_ZONE } from '@/lib/day'
import { storedDayKey } from '@/lib/event'
import { CATEGORICAL_CHART_COLORS } from './chartColors'
import StatsBarChart from './StatsBarChart'

interface Props {
  readonly items: EventStatsItem[]
  readonly filters?: readonly string[]
}

export default function OrganizerRegistrationsChart({ items, filters }: Props) {
  const { t } = useTranslation()

  const reserveByMonth = new Map<string, number>()
  const cancelledByMonth = new Map<string, number>()

  // An event counts from the day after it starts, when its participants have long been picked. Before
  // the draw every entry sits in the reserve group, so an upcoming event would read as all reserve.
  const today = dayOf(new Date(), TIME_ZONE)

  for (const item of items) {
    const day = storedDayKey(item.date)
    if (!day || day >= today) continue
    const key = monthKeyOf(day)
    reserveByMonth.set(key, (reserveByMonth.get(key) ?? 0) + (item.reserveRegistrations ?? 0))
    cancelledByMonth.set(key, (cancelledByMonth.get(key) ?? 0) + (item.cancelledRegistrations ?? 0))
  }

  const months = [...reserveByMonth.keys()].sort((a, b) => a.localeCompare(b))

  return (
    <StatsBarChart
      title={t('stats.admin.reserveCancelledTitle')}
      info={t('stats.admin.reserveCancelledTitleInfo')}
      filters={filters}
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
