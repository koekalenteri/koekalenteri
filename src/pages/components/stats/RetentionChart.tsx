import type { YearlyStatsResponse } from '../../../api/stats'
import { useTranslation } from 'react-i18next'
import { CATEGORICAL_CHART_COLORS } from './chartColors'
import StatsBarChart from './StatsBarChart'

interface Props {
  readonly stats: YearlyStatsResponse[]
}

/**
 * New against returning dog+handler pairs per year — whether the sport is drawing people in or
 * cycling the same ones through.
 *
 * Stacked, because the two add up to that year's total pairs and the split is the point; a
 * grouped pair of bars would invite reading them as unrelated series. Years with no retention
 * record are dropped rather than shown as all-new: the earliest year on record has nothing to
 * compare against, and drawing it would overstate newcomers exactly once, at the left edge.
 */
export default function RetentionChart({ stats }: Props) {
  const { t } = useTranslation()

  const entries = stats.filter((stat) => stat.retention)

  return (
    <StatsBarChart
      title={t('stats.retentionTitle')}
      info={t('stats.retentionTitleInfo')}
      emptyMessage={t('stats.noDataForYear')}
      isEmpty={entries.length === 0}
      chartProps={{
        colors: CATEGORICAL_CHART_COLORS.slice(0, 2),
        series: [
          {
            data: entries.map((stat) => stat.retention?.returning ?? 0),
            label: t('stats.returningDogHandlers'),
            stack: 'pairs',
          },
          {
            data: entries.map((stat) => stat.retention?.new ?? 0),
            label: t('stats.newDogHandlers'),
            stack: 'pairs',
          },
        ],
        xAxis: [{ data: entries.map((stat) => stat.year), scaleType: 'band' }],
      }}
    />
  )
}
