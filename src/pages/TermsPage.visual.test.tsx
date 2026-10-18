import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../assets/Theme'
import { TermsPage } from './TermsPage'

// Tall enough for the whole page at this width: a part past the viewport paints blank.
const VIEWPORT = { height: 1400, width: 1000 }

it('shows the registration terms under their title', async () => {
  await page.viewport(VIEWPORT.width, VIEWPORT.height)
  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: VIEWPORT.width }}>
      <ThemeProvider theme={theme}>
        <TermsPage />
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('heading', { level: 1, name: 'Ilmoittautumisen ehdot' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('terms-page')
})
