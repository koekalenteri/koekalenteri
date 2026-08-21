import type { BreedCode } from '../../../types/Dog'
import type { YearlyBreakdownEntry } from '../../../types/Stats'
import Typography from '@mui/material/Typography'
import { BarChart } from '@mui/x-charts/BarChart'
import { useTranslation } from 'react-i18next'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'

interface Props {
  readonly data: YearlyBreakdownEntry[] | undefined
  readonly limit?: number
}

export default function TopBreedsBarChart({ data = [], limit = 15 }: Props) {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')

  const top = [...data].sort((a, b) => b.count - a.count).slice(0, limit)

  if (top.length === 0) {
    return (
      <>
        <Typography variant="h6">{t('stats.topBreeds')}</Typography>
        <Typography color="text.secondary">{t('stats.noDataForYear')}</Typography>
      </>
    )
  }

  const labels = top.map((entry) => breed(entry.entityId as BreedCode))

  return (
    <>
      <Typography variant="h6">{t('stats.topBreeds')}</Typography>
      <BarChart
        height={Math.max(320, top.length * 28)}
        layout="horizontal"
        colors={[SINGLE_SERIES_CHART_COLOR]}
        yAxis={[{ data: labels, scaleType: 'band' }]}
        series={[{ data: top.map((entry) => entry.count), label: t('stats.participationCount') }]}
        slotProps={{ legend: { hidden: true } }}
        margin={{ left: 140 }}
      />
    </>
  )
}
