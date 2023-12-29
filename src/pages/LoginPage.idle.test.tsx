import { Authenticator } from '@aws-amplify/ui-react'
import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import theme from '../assets/Theme'
import { Path } from '../routeConfig'
import { DataMemoryRouter } from '../test-utils/utils'

import { LoginPage } from './LoginPage'

jest.mock('@aws-amplify/ui-react', () => require('./global-mocks/auth/idle'))

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
            <Authenticator.Provider>
              <DataMemoryRouter initialEntries={[Path.login]} routes={routes} />
            </Authenticator.Provider>
          </SnackbarProvider>
        </ThemeProvider>
      </RecoilRoot>
    )
    expect(container).toMatchSnapshot()
  })
})
