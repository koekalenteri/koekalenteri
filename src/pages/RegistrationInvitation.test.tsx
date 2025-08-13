import type { RouteObject } from 'react-router'

import { Suspense } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates } from '../__mockData__/events'
import { registrationWithStaticDates } from '../__mockData__/registrations'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { Path } from '../routeConfig'
import { DataMemoryRouter, flushPromises } from '../test-utils/utils'

import { LoadingPage } from './LoadingPage'
import { Component as RegistrationInvitation } from './RegistrationInvitation'

// Mock dependencies
jest.mock('../api/event')
jest.mock('../api/registration')

describe('RegistrationInvitation', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('renders loading indicator while loader is pending', async () => {
    const path = Path.invitation(registrationWithStaticDates)
    const routes: RouteObject[] = [
      {
        path,
        element: <RegistrationInvitation />,
        loader: async () => ({
          data: new Promise(() => {}),
        }),
        hydrateFallbackElement: <>hydrate fallback</>,
      },
    ]

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<LoadingPage />}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('redirects to registration page when no invitation URL is available', async () => {
    const path = Path.invitation(registrationWithStaticDates)
    const routes: RouteObject[] = [
      {
        path,
        element: <RegistrationInvitation />,
        loader: async () => ({
          data: Promise.resolve({
            event: eventWithStaticDates,
            registration: registrationWithStaticDates,
          }),
        }),
        hydrateFallbackElement: <>hydrate fallback</>,
      },
      {
        path: 'r/:id/:registrationId',
        element: <>registration-page</>,
      },
    ]

    render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<LoadingPage />}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(screen.getByText('registration-page')).toBeInTheDocument()
  })

  it('renders invitation page when URL is available', async () => {
    const invitationUrl = '/test-invitation-url'
    const path = Path.invitation(registrationWithStaticDates)
    const routes: RouteObject[] = [
      {
        path,
        element: <RegistrationInvitation />,
        loader: async () => ({
          data: Promise.resolve({
            url: invitationUrl,
            event: eventWithStaticDates,
            registration: registrationWithStaticDates,
          }),
        }),
        hydrateFallbackElement: <>hydrate fallback</>,
      },
    ]

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<LoadingPage />}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()

    // Check that event information is displayed
    expect(screen.getByText(eventWithStaticDates.eventType, { exact: false })).toBeInTheDocument()

    // Check that dog information is displayed
    expect(screen.getByText(String(registrationWithStaticDates.dog.name), { exact: false })).toBeInTheDocument()

    // Check that handler information is displayed
    expect(screen.getByText(registrationWithStaticDates.handler.name)).toBeInTheDocument()

    // Check that buttons are displayed
    expect(screen.getByText('invitation.open')).toBeInTheDocument()
    expect(screen.getByText('invitation.download')).toBeInTheDocument()

    // Check that links have correct URLs
    const openButton = screen.getByText('invitation.open').closest('a')
    const downloadButton = screen.getByText('invitation.download').closest('a')

    expect(openButton).toHaveAttribute('href', invitationUrl)
    expect(downloadButton).toHaveAttribute('href', `${invitationUrl}?dl`)
    expect(downloadButton).toHaveAttribute('download', 'kutsu.pdf')
  })
})
