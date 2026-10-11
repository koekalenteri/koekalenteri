import { ThemeProvider } from '@mui/material/styles'
import { act, render, screen } from '@testing-library/react'
import { fetchAuthSession } from 'aws-amplify/auth'
import i18n from 'i18next'
import { createStore, Provider } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import App from './App'
import theme from './assets/Theme'
import { useAuthSessionInitialization } from './hooks/useAuthSessionInitialization'
import { languageStorageKey } from './lib/client/storage'
import { idTokenAtom } from './pages/state'
import { switchLanguage } from './test-utils/language'
import { flushPromises, makeTestIdToken } from './test-utils/utils'

const { pageMounted } = vi.hoisted(() => ({ pageMounted: vi.fn() }))

vi.mock('@aws-amplify/ui-react', () => import('./pages/global-mocks/auth/idle'))
// Settling the session talks to Cognito; its own tests cover it, here only the gate matters.
vi.mock('./hooks/useAuthSessionInitialization', () => ({ useAuthSessionInitialization: vi.fn(() => true) }))
// The session refresh runs for real up to the Cognito call.
vi.mock('aws-amplify/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('aws-amplify/auth')>()),
  fetchAuthSession: vi.fn(),
}))
// Opens the app's WebSocket connection.
vi.mock('./hooks/WebSocketProvider', () => ({
  default: ({ children }: { readonly children: React.ReactNode }) => children,
}))
// Every route is a page that saves and shows a MUI and a date-adapter text, the two locales App
// passes down: what App owns is the frame the pages render in, not the pages.
// The factory is hoisted above the file's imports, JSX runtime included, hence createElement.
vi.mock('./routes', async () => {
  const { useSnackbar } = await import('notistack')
  const { createElement, useEffect } = await import('react')
  const { default: Pagination } = await import('@mui/material/Pagination')
  const { usePickerAdapter } = await import('@mui/x-date-pickers/hooks')
  const SavingPage = () => {
    const { enqueueSnackbar } = useSnackbar()
    const adapter = usePickerAdapter()
    useEffect(() => {
      enqueueSnackbar('Saved', { variant: 'success' })
    }, [enqueueSnackbar])
    useEffect(() => {
      pageMounted()
    }, [])
    return createElement(
      'div',
      null,
      createElement('p', null, 'PAGE'),
      createElement('p', null, adapter.format(new Date(2024, 0, 1), 'weekday')),
      createElement(Pagination, { count: 1 })
    )
  }
  return { default: [{ Component: SavingPage, path: '*' }] }
})

const renderApp = (store = createStore()) =>
  render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </Provider>
  )

const inSeconds = (seconds: number) => Math.floor(Date.now() / 1000) + seconds
/** A valid id token that is already inside the refresh margin, so a refresh would start at once. */
const expiringIdToken = () => makeTestIdToken({ exp: inSeconds(30) })
/** A valid id token far from its refresh, so a logged-in render schedules nothing that fires. */
const freshIdToken = (sub = 'user') => makeTestIdToken({ exp: inSeconds(3600), sub })

const resolveSessionWith = (idToken: string) => {
  const jwt = { payload: {}, toString: () => idToken }
  vi.mocked(fetchAuthSession).mockResolvedValue({ tokens: { accessToken: jwt, idToken: jwt } })
}

const storeLanguage = (language: string) => localStorage.setItem(languageStorageKey, JSON.stringify(language))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuthSessionInitialization).mockReturnValue(true)
  })

  afterEach(async () => {
    localStorage.clear()
    await switchLanguage('fi')
  })

  it('paints a page notice in the theme colour, with a close button', async () => {
    renderApp()

    expect(await screen.findByRole('alert')).toHaveStyle({
      backgroundColor: theme.palette.success.main,
      color: theme.palette.success.contrastText,
    })
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument()
  })

  it('shows the loading page and no route until the auth session has initialized', () => {
    vi.mocked(useAuthSessionInitialization).mockReturnValueOnce(false)

    renderApp()

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText('PAGE')).not.toBeInTheDocument()
  })

  it('brings i18n, the document and the MUI and date locales to the stored language', async () => {
    storeLanguage('en')
    await switchLanguage('fi')

    renderApp()

    expect(await screen.findByText('PAGE')).toBeInTheDocument()
    expect(i18n.language).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('navigation', { name: 'pagination navigation' })).toBeInTheDocument()
    expect(screen.getByText('Monday')).toBeInTheDocument()
  })

  it('follows a language another tab stores', async () => {
    renderApp()
    expect(await screen.findByRole('navigation', { name: 'Sivutus navigaatio' })).toBeInTheDocument()
    expect(screen.getByText('maanantaina')).toBeInTheDocument()

    storeLanguage('en')
    // The setup's localStorage is a plain object, which jsdom refuses as the init's storageArea.
    const event = new StorageEvent('storage', { key: languageStorageKey })
    Object.defineProperty(event, 'storageArea', { value: localStorage })
    act(() => {
      globalThis.dispatchEvent(event)
    })
    await flushPromises()

    expect(i18n.language).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('navigation', { name: 'pagination navigation' })).toBeInTheDocument()
    // A language switch keeps the page, and a half-filled form on it, where it is.
    expect(pageMounted).toHaveBeenCalledTimes(1)
  })

  it('does not refresh the session before it has been initialized', async () => {
    const idToken = expiringIdToken()
    resolveSessionWith(idToken)
    vi.mocked(useAuthSessionInitialization).mockReturnValue(false)
    const store = createStore()
    store.set(idTokenAtom, idToken)

    renderApp(store)
    await flushPromises()

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(fetchAuthSession).not.toHaveBeenCalled()
  })

  it('refreshes an expiring session once it has been initialized', async () => {
    const refreshed = freshIdToken('refreshed')
    resolveSessionWith(refreshed)
    const store = createStore()
    store.set(idTokenAtom, expiringIdToken())

    renderApp(store)
    await flushPromises()

    expect(store.get(idTokenAtom)).toBe(refreshed)
  })

  it('remounts the authenticator and the pages under it when the user logs in and out, not on a refresh', async () => {
    // The mocked authenticator's route never leaves "idle", so the remount is read from the page under it.
    const store = createStore()
    renderApp(store)
    expect(await screen.findByText('PAGE')).toBeInTheDocument()
    expect(pageMounted).toHaveBeenCalledTimes(1)

    act(() => store.set(idTokenAtom, freshIdToken()))
    expect(await screen.findByText('PAGE')).toBeInTheDocument()
    expect(pageMounted).toHaveBeenCalledTimes(2)

    // A refreshed token keeps the user logged in, and a form being filled in where it is.
    act(() => store.set(idTokenAtom, freshIdToken('refreshed')))
    await flushPromises()
    expect(pageMounted).toHaveBeenCalledTimes(2)

    // Logging out says goodbye just before the token goes; the notice outlives the remount.
    act(() => {
      enqueueSnackbar('Goodbye')
    })
    expect(await screen.findByText('Goodbye')).toBeInTheDocument()
    act(() => store.set(idTokenAtom, undefined))
    expect(await screen.findByText('PAGE')).toBeInTheDocument()
    expect(pageMounted).toHaveBeenCalledTimes(3)
    expect(screen.getByText('Goodbye')).toBeInTheDocument()
  })
})
