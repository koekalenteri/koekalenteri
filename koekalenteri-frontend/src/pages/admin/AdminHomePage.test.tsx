import { Authenticator } from '@aws-amplify/ui-react'
import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import theme from '../../assets/Theme'
import { Path } from '../../routeConfig'
import { DataMemoryRouter } from '../../test-utils/utils'

import { AdminHomePage } from './AdminHomePage'

describe('AdminHomePage', () => {
  it('renders the page when user is logged in', () => {
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
          <RecoilRoot>
            <DataMemoryRouter initialEntries={[Path.admin.root]} routes={routes} />
          </RecoilRoot>
        </Authenticator.Provider>
      </ThemeProvider>,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders the child page content when user is logged in', () => {
    const routes = [{
      path: Path.admin.root,
      element: <AdminHomePage />,
      children: [{
        path: Path.admin.index,
        element: <>ADMIN DEFAULT PAGE CONTENT</>,
      }],
    }]
    const { container } = render(
      <ThemeProvider theme={theme}>
        <Authenticator.Provider>
          <RecoilRoot>
            <DataMemoryRouter initialEntries={[Path.admin.index]} routes={routes} />
          </RecoilRoot>
        </Authenticator.Provider>
      </ThemeProvider>,
    )
    expect(container).toMatchSnapshot()
  })
})
