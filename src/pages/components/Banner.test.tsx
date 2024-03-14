import { render } from '@testing-library/react'

import Banner, { BANNER_HEIGHT } from './Banner'

describe('Banner', () => {
  it('should render', () => {
    const { container } = render(<Banner />)
    expect(container).toMatchSnapshot()
    expect(container.firstChild).toHaveStyle({
      backgroundImage: 'url(banner.webp)',
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'cover',
      backgroundOrigin: 'padding-box',
      backgroundPositionY: 'calc(46px - 3vw)',
      width: '100%',
      height: BANNER_HEIGHT,
    })
  })
})
