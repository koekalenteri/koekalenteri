import { render } from '@testing-library/react'
import LoadingIndicator from './LoadingIndicator'

describe('LoadingIndicator', () => {
  it('should render', () => {
    const { container } = render(<LoadingIndicator />)
    expect(container).toMatchSnapshot()
    expect(container.firstChild).toHaveStyle({
      alignItems: 'center',
      display: 'flex',
      height: '100%',
      justifyContent: 'center',
      minHeight: '50vh',
    })
  })
})
