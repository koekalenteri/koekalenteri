import type { YearlyStatsResponse } from '../../../api/stats'
import { render, screen } from '@testing-library/react'
import BreedDistributionChart from './BreedDistributionChart'

vi.mock('@mui/x-charts/BarChart', () => ({
  BarChart: ({ colors, series, xAxis }: any) => (
    <div
      data-testid="chart"
      data-colors={JSON.stringify(colors)}
      data-series={JSON.stringify(series.map((s: any) => ({ data: s.data, label: s.label, stack: s.stack })))}
      data-years={JSON.stringify(xAxis[0].data)}
    />
  ),
}))

const year = (year: number, breedBreakdown: { count: number; entityId: string }[]): YearlyStatsResponse => ({
  breedBreakdown,
  dogHandlerBuckets: [],
  totals: [],
  year,
})

const chart = () => {
  const el = screen.getByTestId('chart')
  return {
    colors: JSON.parse(el.getAttribute('data-colors') ?? '[]'),
    series: JSON.parse(el.getAttribute('data-series') ?? '[]'),
    years: JSON.parse(el.getAttribute('data-years') ?? '[]'),
  }
}

describe('BreedDistributionChart', () => {
  it('stacks one series per top breed across the years', () => {
    render(
      <BreedDistributionChart
        limit={2}
        stats={[
          year(2024, [
            { count: 10, entityId: '122' },
            { count: 6, entityId: '111' },
          ]),
          year(2025, [
            { count: 12, entityId: '122' },
            { count: 8, entityId: '111' },
          ]),
        ]}
      />
    )

    const { series, years } = chart()
    expect(years).toEqual([2024, 2025])
    expect(series).toEqual([
      { data: [10, 12], label: '122', stack: 'breeds' },
      { data: [6, 8], label: '111', stack: 'breeds' },
    ])
  })

  it('folds everything past the limit into one other series', () => {
    render(
      <BreedDistributionChart
        limit={1}
        stats={[
          year(2024, [
            { count: 10, entityId: '122' },
            { count: 6, entityId: '111' },
            { count: 3, entityId: '121' },
          ]),
        ]}
      />
    )

    const { colors, series } = chart()
    expect(series).toEqual([
      { data: [10], label: '122', stack: 'breeds' },
      { data: [9], label: 'stats.otherBreeds', stack: 'breeds' },
    ])
    // The remainder is not an entity, so it takes the neutral rather than a categorical hue.
    expect(colors).toEqual(['#2a78d6', '#8a8a85'])
  })

  it('keeps a breed on the same colour slot even when it is overtaken in a later year', () => {
    // Ranking is taken from the all-year totals, so LAB stays on slot 1 despite losing 2025.
    render(
      <BreedDistributionChart
        limit={2}
        stats={[
          year(2024, [
            { count: 20, entityId: '122' },
            { count: 1, entityId: '111' },
          ]),
          year(2025, [
            { count: 2, entityId: '122' },
            { count: 9, entityId: '111' },
          ]),
        ]}
      />
    )

    expect(chart().series.map((s: any) => s.label)).toEqual(['122', '111'])
  })

  it('omits the other series when every breed fits inside the limit', () => {
    render(<BreedDistributionChart limit={5} stats={[year(2024, [{ count: 10, entityId: '122' }])]} />)

    expect(chart().series).toHaveLength(1)
  })

  it('shows a placeholder when there are no years', () => {
    render(<BreedDistributionChart stats={[]} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
  })
})
