import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../assets/Theme'
// The links' black/bold/underlined look is a global class, not a theme override.
import '../index.css'
import { DataMemoryRouter } from '../test-utils/utils'
import { SupportPage } from './SupportPage'

// The header is the app's, with its own tests; this one is about the page under it.
vi.mock('./components/Header', () => ({ default: () => null }))

it('opens with the question as the heading of the page', async () => {
  const routes: RouteObject[] = [{ element: <SupportPage />, path: '/support' }]
  await page.viewport(800, 300)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 800 }}>
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/support']} routes={routes} />
      </ThemeProvider>
    </div>
  )

  // The question is the page's one heading, at the top level; the two ways to reach support are text (KOE-1506).
  await expect.element(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/toimii oudosti/)
  expect(screen.getByRole('heading').elements()).toHaveLength(1)
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('support-page')
})
