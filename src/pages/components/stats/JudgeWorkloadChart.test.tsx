import { render, screen } from '@testing-library/react'
import JudgeWorkloadChart from './JudgeWorkloadChart'

vi.mock('@mui/x-charts/BarChart', () => ({
  BarChart: ({ series, xAxis }: any) => (
    <div
      data-testid="chart"
      data-series={JSON.stringify(series.map((s: any) => ({ data: s.data, label: s.label })))}
      data-ids={JSON.stringify(xAxis[0].data)}
      data-names={JSON.stringify(xAxis[0].data.map(xAxis[0].valueFormatter))}
    />
  ),
}))

describe('JudgeWorkloadChart', () => {
  it('sorts judges by event count, busiest first', () => {
    render(
      <JudgeWorkloadChart
        data={[
          { count: 3, judgeId: '1', name: 'Matti Meikäläinen' },
          { count: 9, judgeId: '2', name: 'Maija Mallikas' },
        ]}
      />
    )

    const el = screen.getByTestId('chart')
    expect(JSON.parse(el.getAttribute('data-ids') ?? '[]')).toEqual(['2', '1'])
    expect(JSON.parse(el.getAttribute('data-names') ?? '[]')).toEqual(['Maija Mallikas', 'Matti Meikäläinen'])
    expect(JSON.parse(el.getAttribute('data-series') ?? '[]')).toEqual([
      { data: [9, 3], label: 'stats.admin.judgedEvents' },
    ])
  })

  it('keeps judges sharing a display name as separate bars, keyed by their unique judgeId', () => {
    render(
      <JudgeWorkloadChart
        data={[
          { count: 4, judgeId: '1', name: 'Matti Meikäläinen' },
          { count: 2, judgeId: 'Matti Meikäläinen', name: 'Matti Meikäläinen' },
        ]}
      />
    )

    const el = screen.getByTestId('chart')
    expect(JSON.parse(el.getAttribute('data-ids') ?? '[]')).toEqual(['1', 'Matti Meikäläinen'])
    expect(JSON.parse(el.getAttribute('data-names') ?? '[]')).toEqual(['Matti Meikäläinen', 'Matti Meikäläinen'])
    expect(JSON.parse(el.getAttribute('data-series') ?? '[]')).toEqual([
      { data: [4, 2], label: 'stats.admin.judgedEvents' },
    ])
  })

  it('shows a placeholder when there is no data', () => {
    render(<JudgeWorkloadChart data={[]} />)

    expect(screen.getByText('stats.admin.noJudgeData')).toBeInTheDocument()
  })
})
