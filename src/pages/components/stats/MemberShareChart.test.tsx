import type { EventStatsItem } from '../../../types/Stats'
import { render, screen } from '@testing-library/react'
import MemberShareChart from './MemberShareChart'

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
        />
      )}
    </>
  ),
}))

const item = (
  date: Date,
  count: number,
  cancelledRegistrations: number,
  reserveRegistrations: number,
  memberRegistrations: number
): EventStatsItem => ({
  cancelledRegistrations,
  count,
  date,
  memberRegistrations,
  PK: 'ORG#1',
  reserveRegistrations,
  SK: `${date.toISOString()}#event`,
})

const chart = () => {
  const el = screen.getByTestId('chart')
  return {
    months: JSON.parse(el.getAttribute('data-months') ?? '[]'),
    rates: JSON.parse(el.getAttribute('data-rates') ?? '[]'),
  }
}

describe('MemberShareChart', () => {
  it('divides members by starters, to one decimal', () => {
    // 10 registrations, 2 cancelled, 1 reserve -> 7 starters, 3 of them members = 42.9 %
    render(<MemberShareChart items={[item(new Date('2025-03-15T12:00:00Z'), 10, 2, 1, 3)]} />)

    expect(chart().rates).toEqual([42.9])
  })

  it('pools several events of the same month before taking the rate', () => {
    render(
      <MemberShareChart
        items={[
          item(new Date('2025-03-05T12:00:00Z'), 10, 0, 0, 5),
          item(new Date('2025-03-20T12:00:00Z'), 10, 0, 0, 0),
        ]}
      />
    )

    expect(chart()).toEqual({ months: ['2025-03'], rates: [25] })
  })

  it('reports no rate rather than zero when there were no starters', () => {
    render(<MemberShareChart items={[item(new Date('2025-03-15T12:00:00Z'), 2, 2, 0, 0)]} />)

    expect(chart().rates).toEqual([null])
  })

  it('sorts the months and shows a placeholder when there is nothing to plot', () => {
    const { rerender } = render(
      <MemberShareChart
        items={[
          item(new Date('2025-05-01T12:00:00Z'), 10, 0, 0, 2),
          item(new Date('2025-03-01T12:00:00Z'), 10, 0, 0, 2),
        ]}
      />
    )
    expect(chart().months).toEqual(['2025-03', '2025-05'])

    rerender(<MemberShareChart items={[]} />)
    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
  })
})
