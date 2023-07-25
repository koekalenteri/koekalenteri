import type { RouteObject } from 'react-router-dom'

import React from 'react'
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
        path: '/',
        element: <>HOME PAGE</>,
        errorElement: <ErrorPage />,
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
        path: '/',
        element: <ErrorThrowingComponent />,
        errorElement: <ErrorPage />,
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
