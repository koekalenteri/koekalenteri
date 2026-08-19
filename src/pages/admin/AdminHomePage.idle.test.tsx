import { Authenticator } from '@aws-amplify/ui-react'
import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import theme from '../../assets/Theme'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises } from '../../test-utils/utils'
import AdminHomePage from './AdminHomePage'

vi.mock('../../api/user', () => ({ getUser: () => undefined }))
vi.mock('aws-amplify/auth', () => import('../global-mocks/auth/idle'))
vi.mock('@aws-amplify/ui-react', () => import('../global-mocks/auth/idle'))
vi.mock('../../hooks/useAdminSubscription', () => ({
  useAdminSubscription: vi.fn(),
}))

describe('AdminHomePage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should redirect to login page if user is not logged in', async () => {
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
    expect(container).toMatchInlineSnapshot(`
<div>
  Login
</div>
`)
  })
})
