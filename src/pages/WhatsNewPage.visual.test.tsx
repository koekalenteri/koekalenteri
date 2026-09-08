import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../assets/Theme'
// Link styling is a global class rather than a theme override; without it an isolated render
// falls back to the browser's default link look (same gap as ErrorPage.visual.test.tsx).
import '../index.css'
import { DataMemoryRouter } from '../test-utils/utils'
import { WhatsNewPage } from './WhatsNewPage'

// Tall enough for the newest release in full; the older ones below it are the same shape.
const VIEWPORT = { height: 900, width: 900 }

vi.mock('./components/Header', () => ({ default: () => null }))

it('shows the newest release first', async () => {
  const routes: RouteObject[] = [{ element: <WhatsNewPage />, path: '/uutta' }]
  await page.viewport(VIEWPORT.width, VIEWPORT.height)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 900 }}>
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/uutta']} routes={routes} />
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('heading', { name: 'Uutta koekalenterissa' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('whats-new')
})
