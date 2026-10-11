import { ThemeProvider } from '@mui/material/styles'
import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { Provider } from 'jotai'
import App from './App'
import theme from './assets/Theme'
import { useAuthSessionInitialization } from './hooks/useAuthSessionInitialization'
import { languageStorageKey } from './lib/client/storage'
import { switchLanguage } from './test-utils/language'

vi.mock('@aws-amplify/ui-react', () => import('./pages/global-mocks/auth/idle'))
// Both hooks talk to Cognito through Amplify; their own tests cover them, here only the gate matters.
vi.mock('./hooks/useAuthSessionInitialization', () => ({ useAuthSessionInitialization: vi.fn(() => true) }))
vi.mock('./hooks/useAuthSessionRefresh', () => ({ useAuthSessionRefresh: vi.fn() }))
// Opens the app's WebSocket connection.
vi.mock('./hooks/WebSocketProvider', () => ({
  default: ({ children }: { readonly children: React.ReactNode }) => children,
}))
// Every route is a page that saves: what App owns is the frame the pages render in, not the pages.
// The factory is hoisted above the file's imports, JSX runtime included, hence createElement.
vi.mock('./routes', async () => {
  const { useSnackbar } = await import('notistack')
  const { createElement, useEffect } = await import('react')
  const SavingPage = () => {
    const { enqueueSnackbar } = useSnackbar()
    useEffect(() => {
      enqueueSnackbar('Saved', { variant: 'success' })
    }, [enqueueSnackbar])
    return createElement('p', null, 'PAGE')
  }
  return { default: [{ Component: SavingPage, path: '*' }] }
})

const renderApp = () =>
  render(
    <Provider>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </Provider>
  )

describe('App', () => {
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

  it('brings i18n and the document back to the stored language', async () => {
    localStorage.setItem(languageStorageKey, JSON.stringify('en'))
    await switchLanguage('fi')

    renderApp()

    expect(await screen.findByText('PAGE')).toBeInTheDocument()
    expect(i18n.language).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })
})
