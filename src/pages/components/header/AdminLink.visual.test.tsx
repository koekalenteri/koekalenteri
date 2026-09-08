import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { AdminLink } from './AdminLink'

/**
 * Wrapper the screenshot is taken of: the header's own dark AppBar background, since the link's
 * secondary-colored text is only legible against it, not against a plain white page.
 */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#222', display: 'flex', gap: 16, padding: 16, width: 300 }}>
    <ThemeProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ThemeProvider>
  </div>
)

it('shows the active underline next to the plain link', async () => {
  const screen = await render(
    <Frame>
      <AdminLink />
      <AdminLink active activeBorder="2px solid red" />
    </Frame>
  )

  await expect.element(screen.getByRole('link', { name: 'Ylläpito' }).first()).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('admin-link-active')
})
