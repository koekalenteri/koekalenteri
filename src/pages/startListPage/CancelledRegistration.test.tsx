import { render, screen } from '@testing-library/react'
import { CancelledRegistration } from './CancelledRegistration'

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: vi.fn((key) => key),
  }),
}))

describe('CancelledRegistration', () => {
  it('renders the number and the absent mark on one bold line, like a participating row', () => {
    render(
      <table>
        <tbody>
          <CancelledRegistration groupNumber={123} />
        </tbody>
      </table>
    )

    // KOE-1017: the held number prints in the same position as the other dogs' numbers — one line
    // in a single full-width cell, like RegistrationDetails. The bold look is covered by the
    // visual test's screenshot.
    const line = screen.getByText(/123\./)
    expect(line).toHaveTextContent('123. startList.absent')
    expect(line.closest('td')).toHaveAttribute('colspan', '6')
  })
})
