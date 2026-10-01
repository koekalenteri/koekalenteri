import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import LinkButton from './LinkButton'

const Where = () => <div data-testid="where">{useLocation().pathname}</div>

const renderAt = (element: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/previous', '/current']} initialIndex={1}>
      <Where />
      {element}
    </MemoryRouter>
  )

describe('LinkButton', () => {
  it('follows its link', async () => {
    renderAt(<LinkButton to="/next" text="next" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'next' }))
    })

    expect(screen.getByTestId('where')).toHaveTextContent('/next')
  })

  it('goes back instead of following the link when told to', async () => {
    renderAt(<LinkButton to="/next" text="back" back />)

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'back' }))
    })

    expect(screen.getByTestId('where')).toHaveTextContent('/previous')
  })

  it('goes nowhere while loading', async () => {
    const onClick = vi.fn()
    renderAt(<LinkButton to="/next" text="next" loading onClick={onClick} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('link'))
    })

    expect(screen.getByTestId('where')).toHaveTextContent('/current')
    expect(onClick).not.toHaveBeenCalled()
  })
})
