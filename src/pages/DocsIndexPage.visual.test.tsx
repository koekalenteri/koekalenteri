import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../assets/Theme'
// Link styling is a global class rather than a theme override; without it an isolated render
// falls back to the browser's default link look (same gap as ErrorPage.visual.test.tsx).
import '../index.css'
import { DataMemoryRouter } from '../test-utils/utils'
import { DocsIndexPage } from './DocsIndexPage'

// Tall enough for every audience's list and the rules heading: the browser paints nothing past the
// viewport, so a shorter one would cut the index off mid-heading.
const VIEWPORT = { height: 900, width: 900 }

vi.mock('./components/Header', () => ({ default: () => null }))

it('lists the guides by audience', async () => {
  const routes: RouteObject[] = [{ element: <DocsIndexPage />, path: '/docs' }]
  await page.viewport(VIEWPORT.width, VIEWPORT.height)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 900 }}>
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/docs']} routes={routes} />
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('heading', { name: 'Ohjeet' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('docs-index')
})
