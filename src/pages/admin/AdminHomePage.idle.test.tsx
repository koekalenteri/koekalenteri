import { Suspense } from 'react'
import { Authenticator } from '@aws-amplify/ui-react'
import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import theme from '../../assets/Theme'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises } from '../../test-utils/utils'

import AdminHomePage from './AdminHomePage'

jest.mock('@aws-amplify/auth', () => require('../global-mocks/auth/idle'))
jest.mock('@aws-amplify/ui-react', () => require('../global-mocks/auth/idle'))

describe('AdminHomePage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should redirect to login page if user is not logged in', async () => {
    const routes = [
      {
        path: Path.admin.root,
        element: <AdminHomePage />,
      },
      {
        path: Path.login,
        element: <>Login</>,
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
