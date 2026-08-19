import { render } from '@testing-library/react'
import LoadingIndicator from './LoadingIndicator'

describe('LoadingIndicator', () => {
  it('should render', () => {
    const { container } = render(<LoadingIndicator />)
    expect(container).toMatchSnapshot()
    expect(container.firstChild).toHaveAttribute(
      'style',
      'align-items: center; display: flex; height: 100%; justify-content: center; min-height: 50vh;'
    )
  })
})
