import type { EventStatsItem } from '../../../types/Stats'
import { useTranslation } from 'react-i18next'
import { zonedDateString } from '../../../i18n/dates'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'
import StatsBarChart from './StatsBarChart'

interface Props {
  readonly items: EventStatsItem[]
}

const monthKey = (date?: Date): string | undefined => (date ? zonedDateString(date).slice(0, 7) : undefined)

/**
 * Share of starters (non-cancelled, non-reserve registrations) whose owner or handler is a
 * member of the organizing club, per month. A rate rather than a count, and therefore its own
 * chart: a percentage cannot share an axis with the people-counts next to it.
 */
const rateByMonth = (items: EventStatsItem[]) => {
  const totals = new Map<string, { members: number; month: string; starters: number }>()
  for (const item of items) {
    const key = monthKey(item.date)
    if (!key) continue
    const total = totals.get(key) ?? { members: 0, month: key, starters: 0 }
    const starters = (item.count ?? 0) - (item.cancelledRegistrations ?? 0) - (item.reserveRegistrations ?? 0)
    total.starters += Math.max(starters, 0)
    total.members += item.memberRegistrations ?? 0
    totals.set(key, total)
  }
  return [...totals.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((total) => ({
      month: total.month,
      // A month with no starters has no share to speak of; 0 would read as "no members at all".
      rate: total.starters > 0 ? Math.round((total.members / total.starters) * 1000) / 10 : null,
    }))
}

export default function MemberShareChart({ items }: Props) {
  const { t } = useTranslation()

  const entries = rateByMonth(items)

  return (
    <StatsBarChart
      title={t('stats.admin.memberShareTitle')}
      info={t('stats.admin.memberShareTitleInfo')}
      emptyMessage={t('stats.noDataForYear')}
      isEmpty={entries.length === 0}
      chartProps={{
        colors: [SINGLE_SERIES_CHART_COLOR],
        series: [
          {
            data: entries.map((entry) => entry.rate),
            label: t('stats.admin.memberShare'),
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
