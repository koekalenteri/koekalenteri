import { render } from '@testing-library/react'
import { Authenticator } from '@aws-amplify/ui-react';
import { AdminHomePage } from './AdminHomePage'
import { ADMIN_ROOT } from '../../config';
import { ThemeProvider } from '@mui/material';
import theme from '../../assets/Theme';
import { DataMemoryRouter, getHtml } from '../../test-utils/utils';

jest.mock('@aws-amplify/ui-react', () => require('./global-mocks/auth/idle'))

describe('AdminHomePage', () => {
  it('should redirect to login page if user is not logged in', () => {

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
    expect(getHtml(container)).toMatchInlineSnapshot(`
    "<div>
      Login
    </div>"
    `)
  })
})
