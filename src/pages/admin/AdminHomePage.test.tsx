import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import theme from '../../assets/Theme'
import { AuthProvider } from '../../auth/AuthProvider'
import { getAuth0Client } from '../../auth/auth0Client'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises } from '../../test-utils/utils'
import AdminHomePage from './AdminHomePage'

jest.mock('../../api/user')

// JSDOM is not a secure origin; prevent Auth0 SDK initialization from polluting test output.
jest.mock('../../auth/auth0Client', () => ({
  getAuth0Client: jest.fn(),
}))

describe('AdminHomePage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  beforeEach(() => {
    ;(getAuth0Client as unknown as jest.Mock).mockResolvedValue({
      getTokenSilently: async () => undefined,
      handleRedirectCallback: async () => undefined,
      isAuthenticated: async () => true,
      loginWithRedirect: async () => undefined,
      logout: () => undefined,
    })
  })

  it('renders the page when user is logged in', async () => {
    const routes = [
      {
        element: <AdminHomePage />,
        path: Path.admin.root,
      },
      {
        element: <>Login</>,
        path: Path.login,
      },
    ]
    const { container } = render(
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <SnackbarProvider>
            <AuthProvider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter initialEntries={[Path.admin.root]} routes={routes} />
              </Suspense>
            </AuthProvider>
          </SnackbarProvider>
        </RecoilRoot>
      </ThemeProvider>
    )

    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('renders the child page content when user is logged in', async () => {
    const routes = [
      {
        children: [
          {
            element: <>ADMIN DEFAULT PAGE CONTENT</>,
            path: Path.admin.index,
          },
        ],
        element: <AdminHomePage />,
        path: Path.admin.root,
      },
      {
        element: <>Login</>,
        path: Path.login,
      },
    ]
    const { container } = render(
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <SnackbarProvider>
            <AuthProvider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter initialEntries={[Path.admin.index]} routes={routes} />
              </Suspense>
            </AuthProvider>
          </SnackbarProvider>
        </RecoilRoot>
      </ThemeProvider>
    )

    await flushPromises()
    expect(container).toHaveTextContent('ADMIN DEFAULT PAGE CONTENT')
  })
})
