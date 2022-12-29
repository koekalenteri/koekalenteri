import { Authenticator } from '@aws-amplify/ui-react'
import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'

import theme from '../../assets/Theme'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, getHtml } from '../../test-utils/utils'

import { AdminHomePage } from './AdminHomePage'

jest.mock('@aws-amplify/ui-react', () => require('../global-mocks/auth/idle'))

describe('AdminHomePage', () => {
  it('should redirect to login page if user is not logged in', () => {

    const routes = [{
      path: Path.admin.root,
      element: <AdminHomePage />,
    }, {
      path: Path.login,
      element: <>Login</>,
    }]
    const { container } = render(
      <ThemeProvider theme={theme}>
        <Authenticator.Provider>
          <DataMemoryRouter initialEntries={[Path.admin.root]} routes={routes} />
        </Authenticator.Provider>
      </ThemeProvider>,
    )
    expect(getHtml(container)).toMatchInlineSnapshot(`
    "<div>
      Login
    </div>"
    `)
  })
})
