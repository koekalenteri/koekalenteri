import { screen } from '@testing-library/react'

import { renderWithUserEvents } from '../../../../test-utils/utils'

import NoRowsOverlay from './NoRowsOverlay'

describe('NoRowsOverlay', () => {
  it('renders', async () => {
    const { container } = renderWithUserEvents(<NoRowsOverlay />)
    expect(container).toMatchSnapshot()
  })

  it('displays the correct text', () => {
    renderWithUserEvents(<NoRowsOverlay />)
    expect(screen.getByText('Raahaa osallistujat tähän!')).toBeInTheDocument()
  })

  it('has the correct styling', () => {
    renderWithUserEvents(<NoRowsOverlay />)

    const overlay = screen.getByText('Raahaa osallistujat tähän!')
    expect(overlay).toHaveClass('no-rows')
    expect(overlay).toHaveStyle({
      width: '100%',
      height: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    })
  })
})
