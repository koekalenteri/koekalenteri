import { Authenticator } from '@aws-amplify/ui-react'
import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import theme from '../../assets/Theme'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../recoil'
import AdminHomePage from './AdminHomePage'

vi.mock('../../api/user')
vi.mock('../../hooks/useAdminSubscription', () => ({
  useAdminSubscription: vi.fn(),
}))

describe('AdminHomePage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    vi.runOnlyPendingTimers()
  })
  afterAll(() => vi.useRealTimers())

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
        <RecoilRoot initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <SnackbarProvider>
            <Authenticator.Provider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter initialEntries={[Path.admin.root]} routes={routes} />
              </Suspense>
            </Authenticator.Provider>
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
        <RecoilRoot initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <SnackbarProvider>
            <Authenticator.Provider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter initialEntries={[Path.admin.index]} routes={routes} />
              </Suspense>
            </Authenticator.Provider>
          </SnackbarProvider>
        </RecoilRoot>
      </ThemeProvider>
    )

    await flushPromises()
    expect(container).toMatchSnapshot()
  })
})
