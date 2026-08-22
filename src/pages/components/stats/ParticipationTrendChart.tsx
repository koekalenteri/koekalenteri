import type { YearlyStatsResponse } from '../../../api/stats'
import Typography from '@mui/material/Typography'
import { LineChart } from '@mui/x-charts/LineChart'
import { useTranslation } from 'react-i18next'
import { CATEGORICAL_CHART_COLORS } from './chartColors'

interface Props {
  readonly stats: YearlyStatsResponse[]
}

const totalFor = (stat: YearlyStatsResponse, type: string): number =>
  stat.totals.find((total) => total.type === type)?.count ?? 0

export default function ParticipationTrendChart({ stats }: Props) {
  const { t } = useTranslation()

  const years = stats.map((stat) => stat.year)

  return (
    <>
      <Typography variant="h6">{t('stats.participationTrend')}</Typography>
      <LineChart
        height={320}
        colors={[...CATEGORICAL_CHART_COLORS]}
        xAxis={[{ data: years, scaleType: 'point' }]}
        series={[
          {
            data: stats.map((stat) => totalFor(stat, 'dog')),
            label: t('stats.uniqueDogs'),
          },
          {
            data: stats.map((stat) => totalFor(stat, 'handler')),
            label: t('stats.uniqueHandlers'),
          },
          {
            // Not unique breeds: that series sits an order of magnitude below the others, so it
            // flattens the dog/handler lines it shares an axis with. Breeds get their own chart.
            data: stats.map((stat) => totalFor(stat, 'dog#handler')),
            label: t('stats.uniqueDogHandlers'),
          },
        ]}
      />
    </>
  )
}
