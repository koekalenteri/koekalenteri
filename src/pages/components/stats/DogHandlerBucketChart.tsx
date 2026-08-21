import Typography from '@mui/material/Typography'
import { BarChart } from '@mui/x-charts/BarChart'
import { useTranslation } from 'react-i18next'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'

const BUCKET_ORDER = ['1', '2', '3', '4', '5-9', '10+']

interface Props {
  readonly data: { bucket: string; count: number }[]
}

export default function DogHandlerBucketChart({ data }: Props) {
  const { t } = useTranslation()

  const countFor = (bucket: string) => data.find((entry) => entry.bucket === bucket)?.count ?? 0
  const buckets = BUCKET_ORDER.filter((bucket) => countFor(bucket) > 0)

  if (buckets.length === 0) {
    return (
      <>
        <Typography variant="h6">{t('stats.dogHandlerParticipation')}</Typography>
        <Typography color="text.secondary">{t('stats.noDataForYear')}</Typography>
      </>
    )
  }

  return (
    <>
      <Typography variant="h6">{t('stats.dogHandlerParticipation')}</Typography>
      <BarChart
        height={320}
        colors={[SINGLE_SERIES_CHART_COLOR]}
        xAxis={[{ data: buckets, scaleType: 'band' }]}
        series={[{ data: buckets.map(countFor), label: t('stats.count') }]}
        slotProps={{ legend: { hidden: true } }}
      />
    </>
  )
}
