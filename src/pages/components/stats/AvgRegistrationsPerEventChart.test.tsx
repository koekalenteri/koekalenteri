import type { YearlyStatsResponse } from '../../../api/stats'
import { render, screen } from '@testing-library/react'
import AvgRegistrationsPerEventChart from './AvgRegistrationsPerEventChart'

vi.mock('@mui/x-charts/LineChart', () => ({
  LineChart: ({ series, xAxis }: any) => (
    <div
      data-testid="chart"
      data-series={JSON.stringify(series.map((s: any) => ({ data: s.data, label: s.label })))}
      data-years={JSON.stringify(xAxis[0].data)}
    />
  ),
}))

const year = (
  year: number,
  eventTypeBreakdown: { count: number; entityId: string }[],
  eventCount?: number
): YearlyStatsResponse => ({
  dogHandlerBuckets: [],
  eventTypeBreakdown,
  totals: eventCount === undefined ? [] : [{ count: eventCount, type: 'event', year }],
  year,
})

const chart = () => {
  const el = screen.getByTestId('chart')
  return {
    series: JSON.parse(el.getAttribute('data-series') ?? '[]'),
    years: JSON.parse(el.getAttribute('data-years') ?? '[]'),
  }
}

describe('AvgRegistrationsPerEventChart', () => {
  it('divides total registrations by the event count for each year', () => {
    render(
      <AvgRegistrationsPerEventChart
        stats={[
          year(
            2024,
            [
              { count: 30, entityId: 'NOU' },
              { count: 10, entityId: 'NOME-B' },
            ],
            8
          ),
          year(2025, [{ count: 60, entityId: 'NOU' }], 10),
        ]}
      />
    )

    const { series, years } = chart()
    expect(years).toEqual([2024, 2025])
    expect(series).toEqual([{ data: [5, 6], label: 'stats.avgRegistrationsPerEvent' }])
  })

  it('drops years without an event total instead of dividing by zero', () => {
    render(
      <AvgRegistrationsPerEventChart
        stats={[year(2023, [{ count: 10, entityId: 'NOU' }]), year(2024, [{ count: 20, entityId: 'NOU' }], 4)]}
      />
    )

    const { series, years } = chart()
    expect(years).toEqual([2024])
    expect(series).toEqual([{ data: [5], label: 'stats.avgRegistrationsPerEvent' }])
  })

  it('shows a placeholder when there are no years with an event total', () => {
    render(<AvgRegistrationsPerEventChart stats={[year(2024, [{ count: 10, entityId: 'NOU' }])]} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
  })
})
