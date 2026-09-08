import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider, useAtomValue } from 'jotai'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { helpPathAtom, useHelpPath } from '../../state/docs'
import ContextHelp from './ContextHelp'

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

const renderAt = (path: string, children?: React.ReactNode) =>
  render(
    <Provider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                {children}
                <ContextHelp />
                <Location />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  )

describe('ContextHelp', () => {
  it('opens the guide for the view on the screen', async () => {
    const user = userEvent.setup()
    renderAt('/admin/event')

    await user.click(screen.getByRole('button', { name: 'docs.contextHelp' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/ohjeet/koesihteerille/ennen-ilmoaikaa')
  })

  it('shows nothing where no guide describes the view', () => {
    renderAt('/admin/users')

    expect(screen.queryByRole('button', { name: 'docs.contextHelp' })).not.toBeInTheDocument()
  })

  // The event page's guide depends on the event, not the route: the page says which one.
  it('prefers the page the view claims for itself', async () => {
    const user = userEvent.setup()
    const Claim = () => {
      useHelpPath('koesihteerille/ilmoajan-jalkeen')
      const claimed = useAtomValue(helpPathAtom)
      return <div data-testid="claimed">{claimed}</div>
    }
    renderAt('/admin/event/view/abc', <Claim />)

    expect(screen.getByTestId('claimed')).toHaveTextContent('koesihteerille/ilmoajan-jalkeen')
    await user.click(screen.getByRole('button', { name: 'docs.contextHelp' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/ohjeet/koesihteerille/ilmoajan-jalkeen')
  })
})
