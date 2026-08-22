import type { YearlyStatsResponse } from '../../../api/stats'
import { render, screen } from '@testing-library/react'
import RetentionChart from './RetentionChart'

vi.mock('./StatsBarChart', () => ({
  default: ({ title, emptyMessage, isEmpty, chartProps }: any) => (
    <>
      <div>{title}</div>
      {isEmpty ? (
        <div>{emptyMessage}</div>
      ) : (
        <div
          data-testid="chart"
          data-series={JSON.stringify(chartProps.series.map((s: any) => ({ data: s.data, stack: s.stack })))}
          data-years={JSON.stringify(chartProps.xAxis[0].data)}
        />
      )}
    </>
  ),
}))

const year = (year: number, retention?: { new: number; returning: number }): YearlyStatsResponse => ({
  breedBreakdown: [],
  dogHandlerBuckets: [],
  totals: [],
  year,
  ...(retention && { retention: { ...retention, year } }),
})

const chart = () => {
  const el = screen.getByTestId('chart')
  return {
    series: JSON.parse(el.getAttribute('data-series') ?? '[]'),
    years: JSON.parse(el.getAttribute('data-years') ?? '[]'),
  }
}

describe('RetentionChart', () => {
  it('stacks returning below new so the pair sums to the year total', () => {
    render(<RetentionChart stats={[year(2024, { new: 40, returning: 160 })]} />)

    expect(chart().series).toEqual([
      { data: [160], stack: 'pairs' },
      { data: [40], stack: 'pairs' },
    ])
  })

  it('drops years with no retention record rather than drawing them as all-new', () => {
    // The earliest year has nothing to compare against; including it would put a spike of
    // newcomers at the left edge that is only an artefact of where the data begins.
    render(
      <RetentionChart
        stats={[year(2021), year(2022, { new: 120, returning: 180 }), year(2023, { new: 90, returning: 240 })]}
      />
    )

    const { series, years } = chart()
    expect(years).toEqual([2022, 2023])
    expect(series.map((s: any) => s.data)).toEqual([
      [180, 240],
      [120, 90],
    ])
  })

  it('shows a placeholder when no year has retention data yet', () => {
    // The state right after deploy, before the rebuild has written any RETENTION# records.
    render(<RetentionChart stats={[year(2021), year(2022)]} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
  })
})
