import type { BarChartProps } from '@mui/x-charts/BarChart'
import Typography from '@mui/material/Typography'
import { BarChart } from '@mui/x-charts/BarChart'

interface Props {
  readonly title: string
  readonly emptyMessage: string
  readonly isEmpty: boolean
  readonly chartProps: BarChartProps
}

export default function StatsBarChart({ title, emptyMessage, isEmpty, chartProps }: Props) {
  return (
    <>
      <Typography variant="h6">{title}</Typography>
      {isEmpty ? (
        <Typography color="text.secondary">{emptyMessage}</Typography>
      ) : (
        <BarChart height={320} {...chartProps} />
      )}
    </>
  )
}
