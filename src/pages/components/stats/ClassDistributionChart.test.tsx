import { render, screen } from '@testing-library/react'
import ClassDistributionChart from './ClassDistributionChart'

vi.mock('@mui/x-charts/BarChart', () => ({
  BarChart: ({ series, xAxis }: any) => (
    <div
      data-testid="chart"
      data-series={JSON.stringify(series.map((s: any) => ({ data: s.data, label: s.label })))}
      data-classes={JSON.stringify(xAxis[0].data)}
    />
  ),
}))

describe('ClassDistributionChart', () => {
  it('shows only the classes with registrations, in ALO/AVO/VOI order', () => {
    render(
      <ClassDistributionChart
        data={[
          { count: 5, entityId: 'VOI' },
          { count: 12, entityId: 'ALO' },
        ]}
      />
    )

    const el = screen.getByTestId('chart')
    expect(JSON.parse(el.getAttribute('data-classes') ?? '[]')).toEqual(['ALO', 'VOI'])
    expect(JSON.parse(el.getAttribute('data-series') ?? '[]')).toEqual([
      { data: [12, 5], label: 'stats.participationCount' },
    ])
  })

  it('ignores entities that are not a registration class, such as a classless event type fallback', () => {
    render(<ClassDistributionChart data={[{ count: 3, entityId: 'NKM' }]} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
  })

  it('shows a placeholder when there is no data', () => {
    render(<ClassDistributionChart data={undefined} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
  })
})
