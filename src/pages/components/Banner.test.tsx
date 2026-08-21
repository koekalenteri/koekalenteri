import { render } from '@testing-library/react'
import Banner, { BANNER_HEIGHT } from './Banner'

describe('Banner', () => {
  it('should render', () => {
    const { container } = render(<Banner />)
    expect(container).toMatchSnapshot()
    expect(container.firstChild).toHaveStyle({ position: 'relative', width: '100%' })
    expect(BANNER_HEIGHT).toBe('min(25vh, 32vw)')
  })
})
