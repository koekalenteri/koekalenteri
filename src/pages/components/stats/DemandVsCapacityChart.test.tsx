import type { CapacityStatsEntry } from '../../../types/Stats'
import { render, screen } from '@testing-library/react'
import { ALL_CLASSES_ID } from './CapacityUtilizationChart'
import DemandVsCapacityChart from './DemandVsCapacityChart'

vi.mock('@mui/x-charts', () => ({
  BarPlot: () => null,
  ChartsAxisHighlight: () => null,
  ChartsGrid: () => null,
  ChartsLegend: () => null,
  ChartsTooltip: () => null,
  ChartsXAxis: () => null,
  ChartsYAxis: () => null,
  LinePlot: () => null,
  MarkPlot: () => null,
  ResponsiveChartContainer: ({ series, xAxis }: any) => (
    <div
      data-testid="chart"
      data-months={JSON.stringify(xAxis[0].data)}
      data-series={JSON.stringify(
        series.map((s: any) => ({ curve: s.curve, data: s.data, stack: s.stack, type: s.type }))
      )}
    />
  ),
}))

const entry = (
  month: string,
  classKey: string,
  places: number,
  starters: number,
  reserve: number
): CapacityStatsEntry => ({
  cancelledRegistrations: 0,
  class: classKey,
  eventCount: 1,
  eventType: 'NOME-B',
  month,
  organizerId: 'org1',
  places,
  reserve,
  starters,
})

const chart = () => {
  const el = screen.getByTestId('chart')
  return {
    months: JSON.parse(el.getAttribute('data-months') ?? '[]'),
    series: JSON.parse(el.getAttribute('data-series') ?? '[]'),
  }
}

describe('DemandVsCapacityChart', () => {
  it('stacks starters and reserve as bars and draws places as a stepped line', () => {
    // Places is a ceiling, not a count of who turned up, so it must not join the stack; and a
    // smoothed curve would draw capacity gliding between months at values that never existed.
    render(<DemandVsCapacityChart classKey={ALL_CLASSES_ID} data={[entry('2025-05', 'ALO', 40, 30, 6)]} />)

    expect(chart().series).toEqual([
      { data: [30], stack: 'demand', type: 'bar' },
      { data: [6], stack: 'demand', type: 'bar' },
      { curve: 'step', data: [40], type: 'line' },
    ])
  })

  it('sums the classes and event types sharing a month', () => {
    render(
      <DemandVsCapacityChart
        classKey={ALL_CLASSES_ID}
        data={[entry('2025-05', 'ALO', 40, 30, 6), entry('2025-05', 'AVO', 20, 18, 2)]}
      />
    )

    const { months, series } = chart()
    expect(months).toEqual(['2025-05'])
    expect(series.map((s: any) => s.data)).toEqual([[48], [8], [60]])
  })

  it('restricts to the selected class', () => {
    render(
      <DemandVsCapacityChart
        classKey="ALO"
        data={[entry('2025-05', 'ALO', 40, 30, 6), entry('2025-05', 'AVO', 20, 18, 2)]}
      />
    )

    expect(chart().series.map((s: any) => s.data)).toEqual([[30], [6], [40]])
  })

  it('orders months chronologically', () => {
    render(
      <DemandVsCapacityChart
        classKey={ALL_CLASSES_ID}
        data={[entry('2025-11', 'ALO', 40, 30, 0), entry('2025-02', 'ALO', 40, 20, 0)]}
      />
    )

    expect(chart().months).toEqual(['2025-02', '2025-11'])
  })

  it('shows a placeholder instead of an empty chart when the class has no data', () => {
    render(<DemandVsCapacityChart classKey="VOI" data={[entry('2025-05', 'ALO', 40, 30, 0)]} />)

    expect(screen.getByText('stats.admin.noCapacityData')).toBeInTheDocument()
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
  })
})
