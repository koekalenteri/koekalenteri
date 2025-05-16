import { render, screen } from '@testing-library/react'

import { TimeHeader } from './TimeHeader'

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'registration.timeLong.ap') {
        return 'Morning'
      }
      if (key === 'registration.timeLong.ip') {
        return 'Afternoon'
      }
      return key
    },
  }),
}))

describe('TimeHeader', () => {
  const mockDate = new Date('2023-01-01')

  it('renders morning time header correctly', () => {
    render(
      <table>
        <tbody>
          <TimeHeader time="ap" lastDate={mockDate} />
        </tbody>
      </table>
    )

    // Check that time is rendered
    expect(screen.getByText('Morning')).toBeInTheDocument()
  })

  it('renders afternoon time header correctly', () => {
    render(
      <table>
        <tbody>
          <TimeHeader time="ip" lastDate={mockDate} />
        </tbody>
      </table>
    )

    // Check that time is rendered
    expect(screen.getByText('Afternoon')).toBeInTheDocument()
  })
})
