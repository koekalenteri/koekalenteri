import type React from 'react'
import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import theme from '../assets/Theme'
import { DataMemoryRouter, renderWithUserEvents } from '../test-utils/utils'
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
    vi.restoreAllMocks()
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

  // KOE-1463: everything that ends up here is a failure the page cannot recover from on its own,
  // and most of them pass on a second attempt -- so there has to be something to press.
  it('reloads the page on try again', async () => {
    const reload = vi.fn()
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({ ...globalThis.location, reload })
    const routes: RouteObject[] = [
      {
        element: <ErrorThrowingComponent />,
        errorElement: <ErrorPage />,
        path: '/',
      },
    ]
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/']} routes={routes} />
      </ThemeProvider>
    )

    await user.click(screen.getByRole('button', { name: 'error.tryAgain' }))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  // KOE-1755: a chunk that still fails after the automatic reload is almost always a new version
  // of the app, and the page says so instead of a bare "something went wrong".
  it('tells the app has been updated and reloads on a chunk load error', async () => {
    const reload = vi.fn()
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({ ...globalThis.location, reload })
    const routes: RouteObject[] = [
      {
        errorElement: <ErrorPage />,
        lazy: () => Promise.reject(Object.assign(new Error('Loading chunk 1190 failed.'), { name: 'ChunkLoadError' })),
        path: '/',
      },
    ]
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/']} routes={routes} />
      </ThemeProvider>
    )

    expect(await screen.findByRole('heading', { name: 'error.appUpdated' })).toBeInTheDocument()
    expect(screen.getByText('error.appUpdatedInfo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'goHome' })).toHaveAttribute('href', '/')

    await user.click(screen.getByRole('button', { name: 'error.reloadPage' }))

    expect(reload).toHaveBeenCalledTimes(1)
  })
})

function ErrorThrowingComponent(): React.JSX.Element {
  throw new Error('TEST ERROR')
}

function preventDefault(event: Event) {
  event.preventDefault()
}
