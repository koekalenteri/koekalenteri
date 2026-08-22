import type { CapacityStatsEntry } from '../../../types/Stats'
import { render, screen } from '@testing-library/react'
import CancellationRateChart from './CancellationRateChart'
import { ALL_CLASSES_ID } from './CapacityUtilizationChart'

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
          data-rates={JSON.stringify(chartProps.series[0].data)}
          data-tooltip={JSON.stringify([15.4, null].map(chartProps.series[0].valueFormatter))}
          data-ticks={JSON.stringify([0, 25].map(chartProps.yAxis[0].valueFormatter))}
        />
      )}
    </>
  ),
}))

const entry = (
  month: string,
  classKey: string,
  starters: number,
  cancelledRegistrations: number
): CapacityStatsEntry => ({
  cancelledRegistrations,
  class: classKey,
  eventCount: 1,
  eventType: 'NOME-B',
  month,
  organizerId: 'org1',
  places: 40,
  reserve: 0,
  starters,
})

const chart = () => {
  const el = screen.getByTestId('chart')
  return {
    months: JSON.parse(el.getAttribute('data-months') ?? '[]'),
    rates: JSON.parse(el.getAttribute('data-rates') ?? '[]'),
  }
}

describe('CancellationRateChart', () => {
  it('divides cancellations by everyone who registered, to one decimal', () => {
    // 4 of 26 registrations (22 started, 4 withdrew) = 15.4 %
    render(<CancellationRateChart classKey={ALL_CLASSES_ID} data={[entry('2025-03', 'ALO', 22, 4)]} />)

    expect(chart().rates).toEqual([15.4])
  })

  it('pools the classes of a month before taking the rate', () => {
    // Rate of the sums (5/45), not the mean of two separate rates.
    render(
      <CancellationRateChart
        classKey={ALL_CLASSES_ID}
        data={[entry('2025-03', 'ALO', 20, 4), entry('2025-03', 'AVO', 20, 1)]}
      />
    )

    expect(chart()).toEqual({ months: ['2025-03'], rates: [11.1] })
  })

  it('reports no rate rather than zero when nobody registered', () => {
    // Zero would read as "nobody cancelled" instead of "there was nothing to cancel".
    render(<CancellationRateChart classKey={ALL_CLASSES_ID} data={[entry('2025-03', 'ALO', 0, 0)]} />)

    expect(chart().rates).toEqual([null])
  })

  it('restricts to the selected class', () => {
    render(
      <CancellationRateChart classKey="ALO" data={[entry('2025-03', 'ALO', 20, 4), entry('2025-03', 'AVO', 20, 20)]} />
    )

    expect(chart().rates).toEqual([16.7])
  })

  it('sorts the months and shows a placeholder when there is nothing to plot', () => {
    const { rerender } = render(
      <CancellationRateChart
        classKey={ALL_CLASSES_ID}
        data={[entry('2025-05', 'ALO', 10, 1), entry('2025-03', 'ALO', 10, 1)]}
      />
    )
    expect(chart().months).toEqual(['2025-03', '2025-05'])

    rerender(<CancellationRateChart classKey="VOI" data={[entry('2025-03', 'ALO', 10, 1)]} />)
    expect(screen.getByText('stats.admin.noCapacityData')).toBeInTheDocument()
  })

  it('formats axis ticks and tooltips as percentages, and a missing rate as a dash', () => {
    render(<CancellationRateChart classKey={ALL_CLASSES_ID} data={[entry('2025-03', 'ALO', 22, 4)]} />)

    const el = screen.getByTestId('chart')
    expect(JSON.parse(el.getAttribute('data-tooltip') ?? '[]')).toEqual(['15.4 %', '\u2013'])
    expect(JSON.parse(el.getAttribute('data-ticks') ?? '[]')).toEqual(['0 %', '25 %'])
  })
})
