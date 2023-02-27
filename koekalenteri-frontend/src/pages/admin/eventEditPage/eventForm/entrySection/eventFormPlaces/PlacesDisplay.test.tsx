import { render } from '@testing-library/react'

import PlacesDisplay from './PlacesDisplay'

describe('PlacesDisplay', () => {
  it('should render with zero', () => {
    const { container } = render(<PlacesDisplay value={0} />)
    expect(container).toMatchInlineSnapshot(`<div />`)
  })

  it('should render with positive number', () => {
    const { container } = render(<PlacesDisplay value={123} />)
    expect(container).toMatchInlineSnapshot(`
  <div>
    123
  </div>
  `)
  })

})
