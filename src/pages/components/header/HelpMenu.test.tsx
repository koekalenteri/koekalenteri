import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import theme from '@/assets/Theme'
import HelpMenu from './HelpMenu'

const renderAt = (path: string) => {
  const Wrapper = ({ children }: { readonly children: ReactNode }) => (
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </ThemeProvider>
  )

  return render(<HelpMenu />, { wrapper: Wrapper })
}

describe('HelpMenu', () => {
  it('offers the guides, the release notes and the feedback form', async () => {
    const user = userEvent.setup()
    renderAt('/')

    await user.click(screen.getByRole('button', { name: 'support' }))

    expect(screen.getByRole('menuitem', { name: 'docs.title' })).toHaveAttribute('href', '/ohjeet')
    expect(screen.getByRole('menuitem', { name: 'docs.whatsNew' })).toHaveAttribute('href', '/uutta')
    expect(screen.getByRole('menuitem', { name: 'supportContact' })).toHaveAttribute('href', '/support')
  })

  it('disables the item for the page already open', async () => {
    const user = userEvent.setup()
    renderAt('/uutta')

    await user.click(screen.getByRole('button', { name: 'support' }))

    expect(screen.getByRole('menuitem', { name: 'docs.whatsNew' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: 'docs.title' })).not.toHaveAttribute('aria-disabled')
  })
})
