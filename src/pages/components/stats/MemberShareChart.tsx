import type { EventStatsItem } from '../../../types/Stats'
import type { MonthlyRate } from './MonthlyRateChart'
import { useTranslation } from 'react-i18next'
import { zonedDateString } from '../../../i18n/dates'
import MonthlyRateChart, { percentageOf } from './MonthlyRateChart'

interface Props {
  readonly items: EventStatsItem[]
}

const monthKey = (date?: Date): string | undefined => (date ? zonedDateString(date).slice(0, 7) : undefined)

/**
 * Share of starters (non-cancelled, non-reserve registrations) whose owner or handler is a
 * member of the organizing club, per month.
 */
const rateByMonth = (items: EventStatsItem[]): MonthlyRate[] => {
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
    .map((total) => ({ month: total.month, rate: percentageOf(total.members, total.starters) }))
}

export default function MemberShareChart({ items }: Props) {
  const { t } = useTranslation()

  const entries = rateByMonth(items)

  return (
    <MonthlyRateChart
      emptyMessage={t('stats.noDataForYear')}
      entries={entries}
      info={t('stats.admin.memberShareTitleInfo')}
      label={t('stats.admin.memberShare')}
      title={t('stats.admin.memberShareTitle')}
    />
  )
}
