import type { CapacityStatsEntry } from '../../../types/Stats'
import { render, screen } from '@testing-library/react'
import FillRateChart from './FillRateChart'

vi.mock('@mui/x-charts/LineChart', () => ({
  LineChart: ({ series, xAxis }: any) => (
    <div
      data-testid="chart"
      data-series={JSON.stringify(series.map((s: any) => ({ data: s.data, label: s.label })))}
      data-years={JSON.stringify(xAxis[0].data)}
    />
  ),
}))

const entry = (month: string, places: number, starters: number): CapacityStatsEntry => ({
  cancelledRegistrations: 0,
  class: 'ALO',
  eventCount: 1,
  eventType: 'NOME-B',
  month,
  organizerId: '',
  places,
  reserve: 0,
  starters,
})

const chart = () => {
  const el = screen.getByTestId('chart')
  return {
    series: JSON.parse(el.getAttribute('data-series') ?? '[]'),
    years: JSON.parse(el.getAttribute('data-years') ?? '[]'),
  }
}

describe('FillRateChart', () => {
  it('divides starters by places for each year, summing across months and event types', () => {
    render(<FillRateChart data={[entry('2024-06', 20, 15), entry('2024-09', 20, 15), entry('2025-06', 40, 20)]} />)

    const { series, years } = chart()
    expect(years).toEqual([2024, 2025])
    expect(series).toEqual([{ data: [75, 50], label: 'stats.fillRate' }])
  })

  it('drops years with no places instead of dividing by zero', () => {
    render(<FillRateChart data={[entry('2023-06', 0, 0), entry('2024-06', 10, 5)]} />)

    const { series, years } = chart()
    expect(years).toEqual([2024])
    expect(series).toEqual([{ data: [50], label: 'stats.fillRate' }])
  })

  it('shows a placeholder when there is no data', () => {
    render(<FillRateChart data={[]} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
  })
})
