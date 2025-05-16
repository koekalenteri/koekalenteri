import { render, screen } from '@testing-library/react'

import { DateHeader } from './DateHeader'

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === 'dateFormat.weekday') {
        return 'Monday'
      }
      if (key === 'dateFormat.date') {
        return '1.1.2023'
      }
      return key
    },
  }),
}))

describe('DateHeader', () => {
  const mockDate = new Date('2023-01-01')

  it('renders date header correctly', () => {
    render(
      <table>
        <tbody>
          <DateHeader date={mockDate} />
        </tbody>
      </table>
    )

    // Check that date is rendered with weekday and date
    expect(screen.getByText('Monday 1.1.2023')).toBeInTheDocument()
  })
})
