import type { CapacityStatsEntry } from '../../../types/Stats'
import { render, screen } from '@testing-library/react'
import CapacityUtilizationChart, { ALL_CLASSES_ID } from './CapacityUtilizationChart'

// Stands in for the real BarChart, which renders no assertable axis labels in jsdom, while
// keeping the title/placeholder the other tests look for.
vi.mock('./StatsBarChart', () => ({
  default: ({ title, emptyMessage, isEmpty, chartProps }: any) => (
    <>
      <div>{title}</div>
      {isEmpty ? (
        <div>{emptyMessage}</div>
      ) : (
        <div
          data-testid="chart"
          data-months={JSON.stringify(chartProps.xAxis[0].data)}
          data-places={JSON.stringify(chartProps.series[1].data)}
          data-starters={JSON.stringify(chartProps.series[0].data)}
        />
      )}
    </>
  ),
}))

const chartData = () => {
  const chart = screen.getByTestId('chart')
  return {
    months: JSON.parse(chart.getAttribute('data-months') ?? '[]'),
    places: JSON.parse(chart.getAttribute('data-places') ?? '[]'),
    starters: JSON.parse(chart.getAttribute('data-starters') ?? '[]'),
  }
}

const entry = (
  month: string,
  classKey: string,
  places: number,
  starters: number,
  eventType = 'NOME-B'
): CapacityStatsEntry => ({
  cancelledRegistrations: 0,
  class: classKey,
  eventCount: 1,
  eventType,
  month,
  organizerId: '',
  places,
  reserve: 0,
  starters,
})

describe('CapacityUtilizationChart', () => {
  it('renders starters vs. places for the selected class only', () => {
    render(
      <CapacityUtilizationChart
        classKey="ALO"
        data={[entry('2025-05', 'ALO', 20, 18), entry('2025-06', 'ALO', 20, 15), entry('2025-06', 'AVO', 10, 9)]}
      />
    )

    expect(screen.getByText('stats.admin.capacityTitle')).toBeInTheDocument()
  })

  it('shows a placeholder when there is no data for the selected class', () => {
    render(<CapacityUtilizationChart classKey="VOI" data={[entry('2025-06', 'ALO', 20, 15)]} />)

    expect(screen.getByText('stats.admin.noCapacityData')).toBeInTheDocument()
  })

  it('sums every class and event type into one series per month when "all classes" is selected', () => {
    render(
      <CapacityUtilizationChart
        classKey={ALL_CLASSES_ID}
        data={[
          entry('2025-06', 'ALO', 20, 15),
          entry('2025-06', 'AVO', 10, 9),
          entry('2025-06', 'NOU', 5, 4, 'NOU'),
          entry('2025-07', 'ALO', 12, 10),
        ]}
      />
    )

    expect(screen.getByText('stats.admin.capacityTitle')).toBeInTheDocument()
    expect(screen.queryByText('stats.admin.noCapacityData')).not.toBeInTheDocument()
  })

  it('sums a single class across event types when "all event types" is selected', () => {
    // The "all event types" fan-out returns one entry per month *per event type*, so a
    // single-class view still has duplicate months; without aggregation the band axis repeats
    // 2025-06 twice instead of showing one 30/24 bar.
    render(
      <CapacityUtilizationChart
        classKey="ALO"
        data={[
          entry('2025-06', 'ALO', 20, 15),
          entry('2025-06', 'ALO', 10, 9, 'NOME-A'),
          entry('2025-07', 'ALO', 12, 10),
        ]}
      />
    )

    expect(chartData()).toEqual({ months: ['2025-06', '2025-07'], places: [30, 12], starters: [24, 10] })
  })

  it('excludes other classes while aggregating across event types', () => {
    render(
      <CapacityUtilizationChart
        classKey="ALO"
        data={[entry('2025-06', 'ALO', 20, 15), entry('2025-06', 'AVO', 10, 9, 'NOME-A')]}
      />
    )

    expect(chartData()).toEqual({ months: ['2025-06'], places: [20], starters: [15] })
  })
})
