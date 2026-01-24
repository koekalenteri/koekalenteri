import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import theme from '../assets/Theme'
import { DataMemoryRouter } from '../test-utils/utils'
import { ErrorPage } from './ErrorPage'

describe('ErrorPage', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('should render 404', () => {
    const routes: RouteObject[] = [
      {
        element: <>HOME PAGE</>,
        errorElement: <ErrorPage />,
        path: '/',
      },
    ]
    const { container } = render(
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/woot']} routes={routes} />
      </ThemeProvider>
    )
    expect(container).toMatchSnapshot()
  })

  it('should render 500', () => {
    const routes: RouteObject[] = [
      {
        element: <ErrorThrowingComponent />,
        errorElement: <ErrorPage />,
        path: '/',
      },
    ]
    const { container } = render(
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/']} routes={routes} />
      </ThemeProvider>
    )
    expect(container).toMatchSnapshot()
  })
})

function ErrorThrowingComponent(): JSX.Element {
  throw new Error('TEST ERROR')
}
