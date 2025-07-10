import { render } from '@testing-library/react'

import PlacesDisplay from './PlacesDisplay'

describe('PlacesDisplay', () => {
  it('should render the value', () => {
    const { container } = render(<PlacesDisplay value={10} />)
    expect(container).toHaveTextContent('10')
  })

  it('should render empty string for zero value', () => {
    const { container } = render(<PlacesDisplay value={0} />)
    expect(container).toHaveTextContent('')
  })
})
