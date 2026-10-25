import type { ComponentProps } from 'react'
import type { EventStatsItem } from '@/types/Stats'
import type StatsBarChart from './StatsBarChart'
import { render, screen } from '@testing-library/react'
import { freezeClockAt } from '../../../test-utils/freezeClock'
import OrganizerRegistrationsChart from './OrganizerRegistrationsChart'

vi.mock('./StatsBarChart', () => ({
  default: ({ title, emptyMessage, isEmpty, chartProps }: ComponentProps<typeof StatsBarChart>) => (
    <>
      <div>{title}</div>
      {isEmpty ? (
        <div>{emptyMessage}</div>
      ) : (
        <div
          data-testid="chart"
          data-months={JSON.stringify(chartProps.xAxis?.[0]?.data)}
          data-reserve={JSON.stringify(chartProps.series[0]?.data)}
          data-cancelled={JSON.stringify(chartProps.series[1]?.data)}
        />
      )}
    </>
  ),
}))

freezeClockAt('2024-07-10')

const item = (date: string, reserveRegistrations: number, cancelledRegistrations: number): EventStatsItem => ({
  cancelledRegistrations,
  date,
  PK: 'ORG#1',
  reserveRegistrations,
  SK: `${date}#event`,
})

const chart = () => {
  const el = screen.getByTestId('chart')
  return {
    cancelled: JSON.parse(el.getAttribute('data-cancelled') ?? '[]'),
    months: JSON.parse(el.getAttribute('data-months') ?? '[]'),
    reserve: JSON.parse(el.getAttribute('data-reserve') ?? '[]'),
  }
}

describe('OrganizerRegistrationsChart', () => {
  it('sums reserve and cancellations by month', () => {
    render(
      <OrganizerRegistrationsChart
        items={[item('2024-06-15', 2, 1), item('2024-06-20', 1, 0), item('2024-07-01', 0, 1)]}
      />
    )

    expect(screen.getByText('stats.admin.reserveCancelledTitle')).toBeInTheDocument()
    expect(chart()).toEqual({ cancelled: [1, 1], months: ['2024-06', '2024-07'], reserve: [3, 0] })
  })

  it('counts only events that started before today', () => {
    // Before the draw every entry of an upcoming event sits in the reserve group (KOE-1600).
    render(
      <OrganizerRegistrationsChart
        items={[
          item('2024-07-09', 1, 2),
          item('2024-07-10', 5, 1),
          item('2024-07-20', 30, 3),
          item('2024-08-15', 40, 4),
          item('2024-07-08T21:00:00.000Z', 1, 1),
        ]}
      />
    )

    expect(chart()).toEqual({ cancelled: [3], months: ['2024-07'], reserve: [2] })
  })

  it('shows a placeholder when only upcoming events have entries', () => {
    render(<OrganizerRegistrationsChart items={[item('2024-09-01', 12, 0)]} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
  })

  it('shows a placeholder when there is no data', () => {
    render(<OrganizerRegistrationsChart items={[]} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
  })
})
