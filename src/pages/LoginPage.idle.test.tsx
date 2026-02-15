import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import theme from '../assets/Theme'
import { AuthProvider } from '../auth/AuthProvider'
import { Path } from '../routeConfig'
import { DataMemoryRouter } from '../test-utils/utils'

import { Component as LoginPage } from './LoginPage'

jest.mock('./components/Header', () => () => <>HEADER</>)

jest.mock('../auth/AuthProvider', () => {
  const actual = jest.requireActual('../auth/AuthProvider')
  return {
    ...actual,
    // Avoid creating a real Auth0 client in jsdom tests; LoginPage should just render.
    useAuth: () => ({
      isAuthenticated: false,
      isLoading: false,
      getAccessToken: async () => undefined,
      login: async () => undefined,
      logout: async () => undefined,
    }),
    AuthProvider: ({ children }: any) => children,
  }
})

describe('LoginPage', () => {
  it('should render the login page mock when user is not logged in', () => {
    const routes = [
      {
        path: Path.login,
        element: <LoginPage />,
      },
    ]
    const { container } = render(
      <RecoilRoot>
        <ThemeProvider theme={theme}>
          <SnackbarProvider
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            classes={{ containerRoot: 'snack' }}
            disableWindowBlurListener
            maxSnack={3}
          >
            <AuthProvider>
              <DataMemoryRouter initialEntries={[Path.login]} routes={routes} />
            </AuthProvider>
          </SnackbarProvider>
        </ThemeProvider>
      </RecoilRoot>
    )

    expect(container).toMatchSnapshot()
  })
})
