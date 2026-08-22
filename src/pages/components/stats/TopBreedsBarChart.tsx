import type { BreedCode } from '../../../types/Dog'
import type { YearlyBreakdownEntry } from '../../../types/Stats'
import { useTranslation } from 'react-i18next'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'
import StatsBarChart from './StatsBarChart'

interface Props {
  readonly data: YearlyBreakdownEntry[] | undefined
  readonly limit?: number
}

export default function TopBreedsBarChart({ data = [], limit = 15 }: Props) {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')

  const top = [...data].sort((a, b) => b.count - a.count).slice(0, limit)
  const labels = top.map((entry) => breed(entry.entityId as BreedCode))

  return (
    <StatsBarChart
      title={t('stats.topBreeds')}
      emptyMessage={t('stats.noDataForYear')}
      isEmpty={top.length === 0}
      chartProps={{
        colors: [SINGLE_SERIES_CHART_COLOR],
        height: Math.max(320, top.length * 28),
        layout: 'horizontal',
        margin: { left: 140 },
        series: [{ data: top.map((entry) => entry.count), label: t('stats.participationCount') }],
        slotProps: { legend: { hidden: true } },
        yAxis: [{ data: labels, scaleType: 'band' }],
      }}
    />
  )
}
