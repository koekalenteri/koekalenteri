import { useTranslation } from 'react-i18next'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'
import StatsBarChart from './StatsBarChart'

const BUCKET_ORDER = ['1', '2', '3', '4', '5-9', '10+']

interface Props {
  readonly data: { bucket: string; count: number }[]
}

export default function DogsPerHandlerBucketChart({ data }: Props) {
  const { t } = useTranslation()
  const countFor = (bucket: string) => data.find((entry) => entry.bucket === bucket)?.count ?? 0
  const buckets = BUCKET_ORDER.filter((bucket) => countFor(bucket) > 0)

  return (
    <StatsBarChart
      title={t('stats.dogsPerHandler')}
      info={t('stats.dogsPerHandlerInfo')}
      emptyMessage={t('stats.noDataForYear')}
      isEmpty={buckets.length === 0}
      chartProps={{
        colors: [SINGLE_SERIES_CHART_COLOR],
        series: [{ data: buckets.map(countFor), label: t('stats.count') }],
        slotProps: { legend: { hidden: true } },
        xAxis: [{ data: buckets, scaleType: 'band' }],
      }}
    />
  )
}
