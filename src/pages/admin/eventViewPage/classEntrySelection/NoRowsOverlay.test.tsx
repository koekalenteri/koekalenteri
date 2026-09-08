import { screen } from '@testing-library/react'
import { renderWithUserEvents } from '../../../../test-utils/utils'
import NoRowsOverlay from './NoRowsOverlay'

describe('NoRowsOverlay', () => {
  it('renders', async () => {
    renderWithUserEvents(<NoRowsOverlay />)
    expect(screen.getByText('eventManagement.participantSelection.dragHere')).toBeInTheDocument()
  })

  it('displays the correct text', () => {
    renderWithUserEvents(<NoRowsOverlay />)
    expect(screen.getByText('eventManagement.participantSelection.dragHere')).toBeInTheDocument()
  })

  it('has the correct styling', () => {
    renderWithUserEvents(<NoRowsOverlay />)

    const overlay = screen.getByText('eventManagement.participantSelection.dragHere')
    expect(overlay).toHaveClass('no-rows')
    expect(overlay).toHaveStyle({
      alignItems: 'center',
      display: 'flex',
      height: '100%',
      justifyContent: 'center',
      width: '100%',
    })
  })
})
