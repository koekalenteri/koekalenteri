import { render, screen } from '@testing-library/react'
import { CancelledRegistration } from './CancelledRegistration'

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: vi.fn((key) => key),
  }),
}))

describe('CancelledRegistration', () => {
  it('renders cancelled registration correctly', () => {
    render(
      <table>
        <tbody>
          <CancelledRegistration groupNumber={123} />
        </tbody>
      </table>
    )

    // Check that group number is rendered
    expect(screen.getByText('123.')).toBeInTheDocument()

    // Check that the absent mark is rendered
    expect(screen.getByText('startList.absent')).toBeInTheDocument()
  })
})
