import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider, useAtomValue } from 'jotai'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import theme from '@/assets/Theme'
import { helpPathAtom, useHelpPath } from '../../state/docs'
import HelpMenu from './HelpMenu'

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

const renderAt = (path: string, children?: ReactNode) => {
  const Wrapper = ({ children: menu }: { readonly children: ReactNode }) => (
    <Provider>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  {children}
                  {menu}
                  <Location />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </Provider>
  )

  return render(<HelpMenu />, { wrapper: Wrapper })
}

const openMenu = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'support' }))

describe('HelpMenu', () => {
  it('offers the guides, the release notes and the feedback form', async () => {
    const user = userEvent.setup()
    renderAt('/whats-new')

    await openMenu(user)

    expect(screen.getByRole('menuitem', { name: 'docs.title' })).toHaveAttribute('href', '/docs')
    expect(screen.getByRole('menuitem', { name: 'docs.whatsNew' })).toHaveAttribute('href', '/whats-new')
    expect(screen.getByRole('menuitem', { name: 'supportContact' })).toHaveAttribute('href', '/support')
  })

  it('disables the item for the page already open', async () => {
    const user = userEvent.setup()
    renderAt('/whats-new')

    await openMenu(user)

    expect(screen.getByRole('menuitem', { name: 'docs.whatsNew' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: 'docs.title' })).not.toHaveAttribute('aria-disabled')
  })

  // The guide for the view on the screen comes first, and only where a guide describes the view.
  it('opens the guide for the view on the screen', async () => {
    const user = userEvent.setup()
    renderAt('/admin/event')

    await openMenu(user)
    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveTextContent('docs.contextHelp')
    await user.click(items[0])

    expect(screen.getByTestId('location')).toHaveTextContent('/docs/secretary/before-entry-opens')
  })

  // The guide pages themselves have no guide: there the menu starts from the index.
  it.each(['/support', '/docs/participant/entering'])('leaves the item out at %s', async (path) => {
    const user = userEvent.setup()
    renderAt(path)

    await openMenu(user)

    expect(screen.queryByRole('menuitem', { name: 'docs.contextHelp' })).not.toBeInTheDocument()
  })

  // The event page's guide depends on the event, not the route: the page says which one.
  it('prefers the page the view claims for itself', async () => {
    const user = userEvent.setup()
    const Claim = () => {
      useHelpPath('secretary/after-entry-closes')
      const claimed = useAtomValue(helpPathAtom)
      return <div data-testid="claimed">{claimed}</div>
    }
    renderAt('/admin/event/view/abc', <Claim />)

    expect(screen.getByTestId('claimed')).toHaveTextContent('secretary/after-entry-closes')
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'docs.contextHelp' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/docs/secretary/after-entry-closes')
  })
})
