import React from 'react';
import { render } from '@testing-library/react'
import { RouteObject } from 'react-router-dom';
import { ErrorPage } from './ErrorPage'
import { ThemeProvider } from '@mui/material';
import theme from '../assets/Theme';
import { DataMemoryRouter, getHtml } from '../test-utils/utils';

describe('ErrorPage', () => {
  it('should render 404', () => {
    const routes: RouteObject[] = [{
      path: '/',
      element: <>HOME PAGE</>,
      errorElement: <ErrorPage />
    }]
    const { container } = render(
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/woot']} routes={routes} />
      </ThemeProvider>
    )
    expect(getHtml(container)).toMatchSnapshot()
  })

  it('should render 500', () => {
    const routes: RouteObject[] = [{
      path: '/',
      element: <ErrorThrowingComponent />,
      errorElement: <ErrorPage />
    }]
    const { container } = render(
      <ThemeProvider theme={theme}>
        <DataMemoryRouter initialEntries={['/']} routes={routes} />
      </ThemeProvider>
    )
    expect(getHtml(container)).toMatchSnapshot()
  })
})

function ErrorThrowingComponent(): JSX.Element {
  throw new Error('TEST ERROR');
}
