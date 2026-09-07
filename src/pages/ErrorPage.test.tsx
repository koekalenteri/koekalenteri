import type React from 'react'
import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import theme from '../assets/Theme'
import { DataMemoryRouter } from '../test-utils/utils'
import { ErrorPage } from './ErrorPage'

describe('ErrorPage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // React (in dev mode) re-throws render errors via a real dispatched DOM event so devtools
    // shows the original stack. JSDOM's default reporting for an unhandled one prints straight
    // to stderr, bypassing the console.error spy above -- preventDefault silences that.
    window.addEventListener('error', preventDefault)
  })

  afterEach(() => {
    window.removeEventListener('error', preventDefault)
  })

  it('should render 404', () => {
    const routes: RouteObject[] = [
      {
        element: <>HOME PAGE</>,
        errorElement: <ErrorPage />,
        path: '/',
      },
    ]
    render(
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/woot']} routes={routes} />
      </ThemeProvider>
    )
    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'goHome' })).toHaveAttribute('href', '/')
  })

  it('should render 500', () => {
    const routes: RouteObject[] = [
      {
        element: <ErrorThrowingComponent />,
        errorElement: <ErrorPage />,
        path: '/',
      },
    ]
    render(
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/']} routes={routes} />
      </ThemeProvider>
    )
    expect(screen.getByRole('heading', { name: 'error.somethingWentWrong' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'goHome' })).toHaveAttribute('href', '/')
  })
})

function ErrorThrowingComponent(): React.JSX.Element {
  throw new Error('TEST ERROR')
}

function preventDefault(event: Event) {
  event.preventDefault()
}
