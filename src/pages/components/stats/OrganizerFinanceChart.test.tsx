import type { EventStatsItem } from '@/types/Stats'
import { render, screen } from '@testing-library/react'
import OrganizerFinanceChart from './OrganizerFinanceChart'

const item = (date: string, paidAmount: number, refundedAmount: number): EventStatsItem => ({
  date,
  PK: 'ORG#1',
  paidAmount,
  refundedAmount,
  SK: `${date}#event`,
})

describe('OrganizerFinanceChart', () => {
  it('groups day keys by month without crashing', () => {
    render(
      <OrganizerFinanceChart
        items={[item('2024-06-15', 100, 0), item('2024-06-20', 50, 10), item('2024-07-01', 30, 0)]}
      />
    )

    expect(screen.getByText('stats.admin.title')).toBeInTheDocument()
  })

  it('shows a placeholder when there is no data', () => {
    render(<OrganizerFinanceChart items={[]} />)

    expect(screen.getByText('stats.noDataForYear')).toBeInTheDocument()
  })
})
