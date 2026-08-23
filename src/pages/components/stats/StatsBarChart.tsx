import type { BarChartProps } from '@mui/x-charts/BarChart'
import Typography from '@mui/material/Typography'
import { BarChart } from '@mui/x-charts/BarChart'
import ChartTitle from './ChartTitle'

interface Props {
  readonly title: string
  readonly info?: string
  readonly emptyMessage: string
  readonly isEmpty: boolean
  readonly chartProps: BarChartProps
}

export default function StatsBarChart({ title, info, emptyMessage, isEmpty, chartProps }: Props) {
  return (
    <>
      <ChartTitle title={title} info={info} />
      {isEmpty ? (
        <Typography color="text.secondary">{emptyMessage}</Typography>
      ) : (
        <BarChart height={320} {...chartProps} />
      )}
    </>
  )
}
