import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../assets/Theme'
// Link styling is a global class rather than a theme override; without it an isolated render
// falls back to the browser's default link look (same gap as ErrorPage.visual.test.tsx).
import '../index.css'
import { DataMemoryRouter } from '../test-utils/utils'
import { DocsPage } from './DocsPage'

const VIEWPORT = { height: 1400, width: 900 }

vi.mock('./components/Header', () => ({ default: () => null }))

// The whole point of the page is that markdown -- headings, lists, a table -- comes out looking
// like the rest of the application. Only a picture says whether it does.
it('renders a guide', async () => {
  const routes: RouteObject[] = [{ element: <DocsPage />, path: '/ohjeet/*' }]
  await page.viewport(VIEWPORT.width, VIEWPORT.height)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 900 }}>
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/ohjeet/ilmoittautujalle/ilmoittautuminen']} routes={routes} />
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('heading', { level: 1, name: 'Kokeeseen ilmoittautuminen' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('docs-page')
})
