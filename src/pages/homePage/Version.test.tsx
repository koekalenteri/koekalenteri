import { render, screen } from '@testing-library/react'
import pkg from '../../../package.json'
import Version from './Version'

describe('Version', () => {
  it('renders the package version and build timestamp', () => {
    render(<Version />)

    expect(screen.getByText(`v${pkg.version}`)).toBeInTheDocument()
    expect(screen.getByText('01.01.1970')).toBeInTheDocument()
  })
})
