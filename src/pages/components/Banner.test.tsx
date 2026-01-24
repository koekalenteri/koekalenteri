import { render } from '@testing-library/react'
import Banner, { BANNER_HEIGHT } from './Banner'

describe('Banner', () => {
  it('should render', () => {
    const { container } = render(<Banner />)
    expect(container).toMatchSnapshot()
    expect(container.firstChild).toHaveStyle({
      backgroundColor: '#a0a690',
      height: BANNER_HEIGHT,
      position: 'relative',
      width: '100%',
    })
  })
})
