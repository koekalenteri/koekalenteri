import { render, screen } from '@testing-library/react'
import BreedStartRateChart from './BreedStartRateChart'

vi.mock('@mui/x-charts/BarChart', () => ({
  BarChart: ({ series, xAxis }: any) => (
    <div
      data-testid="chart"
      data-series={JSON.stringify(series.map((s: any) => ({ data: s.data, label: s.label })))}
      data-breeds={JSON.stringify(xAxis[0].data)}
    />
  ),
}))

const chart = () => {
  const el = screen.getByTestId('chart')
  return {
    breeds: JSON.parse(el.getAttribute('data-breeds') ?? '[]'),
    series: JSON.parse(el.getAttribute('data-series') ?? '[]'),
  }
}

describe('BreedStartRateChart', () => {
  it('shows starters as a percentage of starters + reserve, busiest breed first', () => {
    render(
      <BreedStartRateChart
        data={[
          // 111 and 122 both have 20 entries total, so they tie on volume and are ordered
          // alphabetically by entityId ('111' before '122'). 312 has fewer entries and sorts last.
          { entityId: '111', reserve: 15, starters: 5 },
          { entityId: '122', reserve: 2, starters: 18 },
          { entityId: '312', reserve: 1, starters: 9 },
        ]}
      />
    )

    expect(chart().breeds).toEqual(['11', '12', '31'])
    expect(chart().series).toEqual([{ data: [25, 90, 90], label: 'stats.breedStartRate' }])
  })

  it('excludes breeds with no non-cancelled entries at all', () => {
    render(<BreedStartRateChart data={[{ entityId: '111', reserve: 0, starters: 0 }]} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
  })

  it('shows a placeholder when there is no data', () => {
    render(<BreedStartRateChart data={undefined} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
  })
})
