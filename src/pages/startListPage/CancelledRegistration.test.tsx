import { render, screen } from '@testing-library/react'

import { CancelledRegistration } from './CancelledRegistration'

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

    // Check that PERUTTU text is rendered
    expect(screen.getByText('PERUTTU')).toBeInTheDocument()
  })
})
