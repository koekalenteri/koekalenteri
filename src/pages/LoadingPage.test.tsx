import { render } from '@testing-library/react'

import { LoadingPage } from './LoadingPage'

describe('LoadingPage', () => {
  it('should render', () => {
    const { container } = render(<LoadingPage />)
    expect(container).toMatchSnapshot()
  })
})
