import type { EventStatsItem } from '@/types/Stats'
import { render, screen } from '@testing-library/react'
import OrganizerRegistrationsChart from './OrganizerRegistrationsChart'

const item = (date: string, reserveRegistrations: number, cancelledRegistrations: number): EventStatsItem => ({
  cancelledRegistrations,
  date,
  PK: 'ORG#1',
  reserveRegistrations,
  SK: `${date}#event`,
})

describe('OrganizerRegistrationsChart', () => {
  it('groups day keys by month without crashing', () => {
    render(
      <OrganizerRegistrationsChart
        items={[item('2024-06-15', 2, 1), item('2024-06-20', 1, 0), item('2024-07-01', 0, 1)]}
      />
    )

    expect(screen.getByText('stats.admin.reserveCancelledTitle')).toBeInTheDocument()
  })

  it('shows a placeholder when there is no data', () => {
    render(<OrganizerRegistrationsChart items={[]} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
  })
})
