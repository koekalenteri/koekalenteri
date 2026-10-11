import { Authenticator } from '@aws-amplify/ui-react'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import theme from '../assets/Theme'
import { Path } from '../routeConfig'
import { DataMemoryRouter } from '../test-utils/utils'
import AppSnackbarProvider from './components/AppSnackbarProvider'
import { Component as LoginPage } from './LoginPage'
import { idTokenAtom } from './state'

vi.mock('@aws-amplify/ui-react', () => import('./global-mocks/auth/idle'))
vi.mock('./components/Header', () => ({ default: () => <>HEADER</> }))

describe('LoginPage', () => {
  it('should render the login page mock when user is not logged in', () => {
    const routes = [
      {
        element: <LoginPage />,
        path: Path.login,
      },
    ]
    render(
      <Provider initializeState={({ set }) => set(idTokenAtom, undefined)}>
        <ThemeProvider theme={theme}>
          <AppSnackbarProvider>
            <Authenticator.Provider>
              <DataMemoryRouter initialEntries={[Path.login]} routes={routes} />
            </Authenticator.Provider>
          </AppSnackbarProvider>
        </ThemeProvider>
      </Provider>
    )

    expect(screen.getByText('HEADER')).toBeInTheDocument()
    expect(screen.getByText('MOCK AUTHENTICATOR')).toBeInTheDocument()
  })
})
