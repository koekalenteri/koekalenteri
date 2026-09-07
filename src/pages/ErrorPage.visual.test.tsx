import type React from 'react'
import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../assets/Theme'
// The "Etusivulle" link's black/bold/underlined look is a global class, not a theme override; an
// isolated render never loads it otherwise and the link falls back to the browser's default blue
// (same gap as KOE-1324's SearchPage.visual.test.tsx).
import '../index.css'
import { DataMemoryRouter } from '../test-utils/utils'
import { ErrorPage } from './ErrorPage'

const VIEWPORT = { height: 600, width: 800 }

// React (in dev mode) re-throws render errors via a real dispatched DOM event so devtools shows
// the original stack; left unhandled the browser test runner treats it as a failure even though
// the error boundary below already caught and rendered it.
function preventDefault(event: Event) {
  event.preventDefault()
}

beforeEach(() => window.addEventListener('error', preventDefault))
afterEach(() => window.removeEventListener('error', preventDefault))

it('shows a 404 for an unknown route', async () => {
  const routes: RouteObject[] = [
    {
      element: <>HOME PAGE</>,
      errorElement: <ErrorPage />,
      path: '/',
    },
  ]
  await page.viewport(VIEWPORT.width, VIEWPORT.height)
  const screen = await render(
    <div data-testid="visual-root">
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/woot']} routes={routes} />
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('heading', { name: '404' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('error-page-404')
})

it('shows a generic message for an unhandled error', async () => {
  const routes: RouteObject[] = [
    {
      element: <ErrorThrowingComponent />,
      errorElement: <ErrorPage />,
      path: '/',
    },
  ]
  await page.viewport(VIEWPORT.width, VIEWPORT.height)
  const screen = await render(
    <div data-testid="visual-root">
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/']} routes={routes} />
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('heading', { name: 'Jotakin meni pieleen.' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('error-page-500')
})

function ErrorThrowingComponent(): React.JSX.Element {
  throw new Error('TEST ERROR')
}
