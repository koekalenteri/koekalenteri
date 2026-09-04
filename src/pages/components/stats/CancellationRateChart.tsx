import type { CapacityStatsEntry } from '../../../types/Stats'
import type { MonthlyRate } from './MonthlyRateChart'
import { useTranslation } from 'react-i18next'
import { ALL_CLASSES_ID } from './CapacityUtilizationChart'
import MonthlyRateChart, { percentageOf } from './MonthlyRateChart'

interface Props {
  readonly data: CapacityStatsEntry[]
  readonly classKey: string
}

/**
 * Share of registrations that were cancelled, per month.
 *
 * The denominator is every registration: starters, those left in reserve and the cancelled. A
 * withdrawal from the waiting list is as much a cancellation as one from a place — many come in
 * before the participants are even picked — and a cancelled entry no longer records which of the
 * two it was, so the only honest base is everyone who entered.
 */
const rateByMonth = (data: CapacityStatsEntry[]): MonthlyRate[] => {
  const totals = new Map<string, { cancelled: number; month: string; registered: number }>()
  for (const entry of data) {
    const total = totals.get(entry.month) ?? { cancelled: 0, month: entry.month, registered: 0 }
    total.cancelled += entry.cancelledRegistrations
    total.registered += entry.starters + entry.reserve + entry.cancelledRegistrations
    totals.set(entry.month, total)
  }
  return [...totals.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((total) => ({ month: total.month, rate: percentageOf(total.cancelled, total.registered) }))
}

export default function CancellationRateChart({ data, classKey }: Props) {
  const { t } = useTranslation()

  const entries = rateByMonth(classKey === ALL_CLASSES_ID ? data : data.filter((entry) => entry.class === classKey))

  return (
    <MonthlyRateChart
      emptyMessage={t('stats.admin.noCapacityData')}
      entries={entries}
      info={t('stats.admin.cancellationRateTitleInfo')}
      label={t('stats.admin.cancellationRate')}
      title={t('stats.admin.cancellationRateTitle')}
    />
  )
}
