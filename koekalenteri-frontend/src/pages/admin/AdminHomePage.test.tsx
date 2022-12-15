import { render } from '@testing-library/react'
import { Authenticator } from '@aws-amplify/ui-react';
import { AdminHomePage } from './AdminHomePage'
import { ADMIN_DEFAULT, ADMIN_ROOT } from '../../config';
import { ThemeProvider } from '@mui/material';
import theme from '../../assets/Theme';
import { DataMemoryRouter, getHtml } from '../../test-utils/utils';

describe('AdminHomePage', () => {
  it('renders the page when user is logged in', () => {
    const routes = [{
      path: ADMIN_ROOT,
      element: <AdminHomePage />
    },{
      path: '/login',
      element: <>Login</>
    }]
    const { container } = render(
      <ThemeProvider theme={theme}>
        <Authenticator.Provider>
          <DataMemoryRouter initialEntries={[ADMIN_ROOT]} routes={routes} />
        </Authenticator.Provider>
      </ThemeProvider>
    )
    expect(getHtml(container)).toMatchSnapshot()
  })

  it('renders the child page content when user is logged in', () => {
    const routes = [{
      path: ADMIN_ROOT,
      element: <AdminHomePage />,
      children: [{
        path: ADMIN_DEFAULT,
        element: <>ADMIN DEFAULT PAGE CONTENT</>
      }]
    }]
    const { container } = render(
      <ThemeProvider theme={theme}>
        <Authenticator.Provider>
          <DataMemoryRouter initialEntries={[ADMIN_DEFAULT]} routes={routes} />
        </Authenticator.Provider>
      </ThemeProvider>
    )
    expect(getHtml(container)).toMatchSnapshot()
  })
})
