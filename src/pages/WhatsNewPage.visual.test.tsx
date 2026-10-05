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

// The page lists every release, newest first, and grows with each one; whatever lies below the
// viewport is left unpainted, and the viewport cannot grow past the browser window. So the shot
// is of the newest release alone, with the viewport sized to it; the older ones are the same shape.
const VIEWPORT = { height: 900, width: 900 }

vi.mock('./components/Header', () => ({ default: () => null }))

it('shows the newest release first', async () => {
  const routes: RouteObject[] = [{ element: <WhatsNewPage />, path: '/whats-new' }]
  await page.viewport(VIEWPORT.width, VIEWPORT.height)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 900 }}>
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/whats-new']} routes={routes} />
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('heading', { name: 'Uutta koekalenterissa' })).toBeVisible()
  const newest = screen.container.querySelector('section')
  if (!newest) throw new Error('the page has no release section')
  await page.viewport(VIEWPORT.width, Math.ceil(newest.getBoundingClientRect().bottom))
  await expect(page.elementLocator(newest)).toMatchScreenshot('whats-new')
})
