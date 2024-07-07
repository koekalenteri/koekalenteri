import { render } from '@testing-library/react'

import LoadingIndicator from './LoadingIndicator'

describe('LoadingIndicator', () => {
  it('should render', () => {
    const { container } = render(<LoadingIndicator />)
    expect(container).toMatchSnapshot()
    expect(container.firstChild).toHaveStyle({
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100%',
      minHeight: '50vh',
    })
  })
})
