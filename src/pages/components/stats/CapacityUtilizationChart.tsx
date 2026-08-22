import type { CapacityStatsEntry } from '../../../types/Stats'
import { useTranslation } from 'react-i18next'
import { CATEGORICAL_CHART_COLORS } from './chartColors'
import StatsBarChart from './StatsBarChart'

interface Props {
  readonly data: CapacityStatsEntry[]
  readonly classKey: string
}

export default function CapacityUtilizationChart({ data, classKey }: Props) {
  const { t } = useTranslation()

  const entries = data.filter((entry) => entry.class === classKey).sort((a, b) => a.month.localeCompare(b.month))

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
