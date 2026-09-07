import { render, screen } from '@testing-library/react'
import { LoadingPage } from './LoadingPage'

describe('LoadingPage', () => {
  it('should render', () => {
    render(<LoadingPage />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })
})
