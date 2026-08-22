import type { EventStatsItem } from '../../../types/Stats'
import { render, screen } from '@testing-library/react'
import OrganizerFinanceChart from './OrganizerFinanceChart'

const item = (date: Date, paidAmount: number, refundedAmount: number): EventStatsItem => ({
  date,
  PK: 'ORG#1',
  paidAmount,
  refundedAmount,
  SK: `${date.toISOString()}#event`,
})

describe('OrganizerFinanceChart', () => {
  it('groups revived Date values by month without crashing', () => {
    render(
      <OrganizerFinanceChart
        items={[
          item(new Date('2024-06-15T12:00:00Z'), 100, 0),
          item(new Date('2024-06-20T12:00:00Z'), 50, 10),
          item(new Date('2024-07-01T12:00:00Z'), 30, 0),
        ]}
      />
    )

    expect(screen.getByText('stats.admin.title')).toBeInTheDocument()
  })

  it('shows a placeholder when there is no data', () => {
    render(<OrganizerFinanceChart items={[]} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
  })
})
