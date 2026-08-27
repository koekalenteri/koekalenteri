import type { EventStatsItem } from '../../../types/Stats'
import { render, screen } from '@testing-library/react'
import OrganizerRegistrationsChart from './OrganizerRegistrationsChart'

const item = (date: Date, reserveRegistrations: number, cancelledRegistrations: number): EventStatsItem => ({
  cancelledRegistrations,
  date,
  PK: 'ORG#1',
  reserveRegistrations,
  SK: `${date.toISOString()}#event`,
})

describe('OrganizerRegistrationsChart', () => {
  it('groups revived Date values by month without crashing', () => {
    render(
      <OrganizerRegistrationsChart
        items={[
          item(new Date('2024-06-15T12:00:00Z'), 2, 1),
          item(new Date('2024-06-20T12:00:00Z'), 1, 0),
          item(new Date('2024-07-01T12:00:00Z'), 0, 1),
        ]}
      />
    )

    expect(screen.getByText('stats.admin.reserveCancelledTitle')).toBeInTheDocument()
  })

  it('shows a placeholder when there is no data', () => {
    render(<OrganizerRegistrationsChart items={[]} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
  })
})
