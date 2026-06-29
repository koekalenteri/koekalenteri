import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { enqueueSnackbar, SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { unpaidRegistrationWithStaticDates } from '../__mockData__/registrations'
import * as eventApi from '../api/event'
import { APIError } from '../api/http'
import * as registrationApi from '../api/registration'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { Path } from '../routeConfig'
import { DataMemoryRouter, flushPromises, renderWithUserEvents } from '../test-utils/utils'
import { RegistrationListPage } from './RegistrationListPage'

jest.mock('../lib/navigation', () => ({
  redirectTo: jest.fn(),
}))

import { redirectTo } from '../lib/navigation'

// Mock the API modules
jest.mock('../api/user')
jest.mock('../api/event')
jest.mock('../api/eventType')
jest.mock('../api/judge')
jest.mock('../api/official')
jest.mock('../api/organizer')
jest.mock('../api/registration')

// Mock the enqueueSnackbar function
jest.mock('notistack', () => ({
  ...jest.requireActual('notistack'),
  enqueueSnackbar: jest.fn(),
}))

describe('RegistrationListPage', () => {
  beforeAll(() => jest.useFakeTimers())

  afterEach(() => {
    jest.runOnlyPendingTimers()
    localStorage.clear()
    sessionStorage.clear()
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  afterAll(() => jest.useRealTimers())

  // Helper function to render the component with router
  const renderWithRouter = (
    path: string,
    props: { cancel?: boolean; confirm?: boolean; invitation?: boolean } = {}
  ) => {
    const routes: RouteObject[] = [
      {
        element: <RegistrationListPage {...props} />,
        path: '/r/:id/:registrationId',
      },
      {
        element: <RegistrationListPage cancel={true} />,
        path: '/r/:id/:registrationId/cancel',
      },
      {
        element: <RegistrationListPage confirm={true} />,
        path: '/r/:id/:registrationId/confirm',
      },
      {
        element: <RegistrationListPage invitation={true} />,
        path: '/r/:id/:registrationId/invitation',
      },
      {
        element: <RegistrationListPage />,
        path: '/r/:id/:registrationId/saved',
      },
      {
        element: <>Payment Page</>,
        path: '/payment/:id/:registrationId',
      },
      {
        element: <>Invitation Attachment</>,
        path: '/invitation-attachment/:id/:registrationId',
      },
    ]

    const result = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    return {
      ...result,
    }
  }

  it('renders the page with all components', async () => {
    renderWithRouter('/r/test1/nou-registration')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    // Check that the main components are rendered
    expect(screen.getByText('registration.registeredDogs')).toBeInTheDocument()
  })

  it('opens cancel dialog when on cancel route', async () => {
    // allow couple of minutes margin for timers
    jest.setSystemTime(new Date('2021-02-08T23:55:00.000+02:00')) // must be before event.endDate
    renderWithRouter('/r/test1/nou-registration/cancel')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = await screen.findByRole('dialog', { name: 'registration.cancelDialog.title' })
    expect(dialog).toBeVisible()
    expect(
      screen.queryByText('registration.cancelDialog.lateText contact, event, registration')
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('registration.cancelDialog.reason')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'registration.cancelDialog.cta' })).toBeInTheDocument()
  })

  it('opens cancel dialog when on cancel route (late)', async () => {
    jest.setSystemTime(new Date('2021-02-08T23:59:59.000+02:00')) // must be before event.endDate
    renderWithRouter('/r/test1/nou-registration/cancel')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = await screen.findByRole('dialog', { name: 'registration.cancelDialog.title' })
    expect(dialog).toBeVisible()
    expect(screen.getByText('registration.cancelDialog.lateText contact, event, registration')).toBeInTheDocument()
    expect(screen.queryByLabelText('registration.cancelDialog.reason')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'registration.cancelDialog.cta' })).not.toBeInTheDocument()
  })

  it('opens confirm dialog when on confirm route', async () => {
    jest.setSystemTime(new Date('2021-02-08')) // must be before event.endDate
    renderWithRouter('/r/test1/nou-registration/confirm')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const confirmButton = await screen.findByRole('button', { name: 'registration.confirmDialog.cta' })
    expect(confirmButton).toBeInTheDocument()
  })

  it('shows loading instead of event not found while confirm route event fetch is pending', async () => {
    jest.setSystemTime(new Date('2021-02-08')) // must be before event.endDate
    jest.spyOn(eventApi, 'getEvent').mockReturnValue(new Promise(() => {}) as never)

    renderWithRouter('/r/test1/nou-registration/confirm')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()

    expect(screen.queryByText('loading...')).not.toBeInTheDocument()
    expect(screen.queryByText('error.eventNotFound')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('handles cancel action when cancel dialog is submitted', async () => {
    jest.setSystemTime(new Date('2021-02-08')) // must be at leaset 1 days before event start

    const { user } = renderWithRouter('/r/test1/nou-registration/cancel')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = screen.getByRole('dialog', { name: 'registration.cancelDialog.title' })
    expect(dialog).toBeVisible()

    const cancelButton = await screen.findByRole('button', { name: 'registration.cancelDialog.cta' })
    expect(cancelButton).toBeInTheDocument()

    const reasonSelect = screen.getByLabelText('registration.cancelDialog.reason')
    await user.click(reasonSelect)

    await flushPromises()

    const option = await screen.findByRole('option', { name: 'registration.cancelReason.dog-heat' })
    expect(option).toBeVisible()
    await user.click(option)

    await flushPromises()

    expect(cancelButton).toBeEnabled()
    await user.click(cancelButton)

    await flushPromises()

    expect(cancelButton).not.toBeVisible()
  })

  it('handles confirm action when confirm dialog is submitted', async () => {
    const confirmRequest = new Promise((resolve) =>
      setTimeout(() => resolve({ ...unpaidRegistrationWithStaticDates, confirmed: true }), 1000)
    )
    const putRegistrationSpy = jest.spyOn(registrationApi, 'putRegistration').mockReturnValue(confirmRequest as never)

    jest.setSystemTime(new Date('2021-02-08')) // must be before event.endDate
    const { user } = renderWithRouter('/r/test1/nou-registration/confirm')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    // The confirm dialog should be open
    const dialog = screen.getByRole('dialog', { name: 'registration.confirmDialog.title' })
    expect(dialog).toBeVisible()

    const confirmButton = screen.getByRole('button', { name: 'registration.confirmDialog.cta' })
    expect(confirmButton).toBeEnabled()
    await user.click(confirmButton)

    expect(confirmButton).toBeDisabled()

    expect(putRegistrationSpy).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(1000)

    await flushPromises()

    expect(dialog).not.toBeVisible()

    putRegistrationSpy.mockRestore()
  })

  it('handles 304 from confirm action as a successful no-op', async () => {
    const putRegistrationSpy = jest
      .spyOn(registrationApi, 'putRegistration')
      .mockRejectedValue(new APIError(new Response(null, { status: 304, statusText: 'Not Modified' }), ''))
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    jest.setSystemTime(new Date('2021-02-08'))
    const { user } = renderWithRouter('/r/test1/nou-registration/confirm')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = screen.getByRole('dialog', { name: 'registration.confirmDialog.title' })
    const confirmButton = screen.getByRole('button', { name: 'registration.confirmDialog.cta' })

    await user.click(confirmButton)
    await flushPromises()

    expect(putRegistrationSpy).toHaveBeenCalledTimes(1)
    expect(dialog).not.toBeVisible()
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
    putRegistrationSpy.mockRestore()
  })

  it('handles invitation read when on invitation route', async () => {
    const putRegistrationSpy = jest.spyOn(registrationApi, 'putRegistration')

    jest.setSystemTime(new Date('2021-02-08')) // must be before event.endDate
    renderWithRouter('/r/test1/nou-registration/invitation')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    // Wait for the action to complete
    await flushPromises()

    expect(putRegistrationSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'nou-registration', invitationRead: true })
    )
  })

  it('shows snackbar when on saved route with payment success', async () => {
    const routes: RouteObject[] = [
      {
        element: <RegistrationListPage />,
        path: '/r/:id/:registrationId/saved',
      },
      {
        element: <>Registration Page</>,
        path: '/r/:id/:registrationId',
      },
    ]

    render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={['/r/test1/nou-registration/saved']} routes={routes} />
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith('registration.saved count, to', {
      style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
      variant: 'success',
    })
    expect(screen.getByText('Registration Page')).toBeInTheDocument()
  })

  it('closes cancel dialog when close button is clicked', async () => {
    const { user } = renderWithRouter('/r/test1/nou-registration/cancel')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = screen.getByRole('dialog', { name: 'registration.cancelDialog.title' })
    expect(dialog).toBeVisible()

    const closeButton = screen.getByRole('button', { name: 'close' })
    await user.click(closeButton)

    await flushPromises()

    expect(dialog).not.toBeVisible()
  })

  it('closes confirm dialog when close button is clicked', async () => {
    jest.setSystemTime(new Date('2021-02-08')) // must be before event.endDate

    const { user } = renderWithRouter('/r/test1/nou-registration/confirm')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = screen.getByRole('dialog', { name: 'registration.confirmDialog.title' })
    expect(dialog).toBeVisible()

    // Click the close button
    const closeButton = screen.getByRole('button', { name: 'cancel' })
    await user.click(closeButton)

    await flushPromises()

    expect(dialog).not.toBeVisible()
  })

  it('opens payment dialog automatically', async () => {
    renderWithRouter('/r/test1/unpaid-picked-nou-registration')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = await screen.findByRole('dialog', { name: 'registration.paymentDialog.title' })
    expect(dialog).toBeVisible()
  })

  it('reloads pending payment', async () => {
    const getRegistrationSpy = jest
      .spyOn(registrationApi, 'getRegistration')
      .mockResolvedValueOnce({
        ...unpaidRegistrationWithStaticDates,
        paymentStatus: 'PENDING',
      })
      .mockResolvedValue({
        ...unpaidRegistrationWithStaticDates,
        paymentStatus: 'SUCCESS',
      })

    renderWithRouter('/r/test1/unpaid-nou-registration')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    jest.runOnlyPendingTimers()
    await flushPromises(false)
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    expect(getRegistrationSpy).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(10_000)

    expect(getRegistrationSpy).toHaveBeenCalledTimes(2)
    await flushPromises()

    getRegistrationSpy.mockRestore()
  })

  it('reloads payment after successful payment return before backend status changes', async () => {
    const getRegistrationSpy = jest
      .spyOn(registrationApi, 'getRegistration')
      .mockResolvedValueOnce({
        ...unpaidRegistrationWithStaticDates,
      })
      .mockResolvedValue({
        ...unpaidRegistrationWithStaticDates,
        paymentStatus: 'SUCCESS',
      })

    renderWithRouter('/r/test1/unpaid-nou-registration/saved?payment=verifying')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    jest.runOnlyPendingTimers()
    await flushPromises(false)
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    expect(enqueueSnackbar).toHaveBeenCalledWith('registration.notifications.paymentVerifying', { variant: 'info' })
    expect(screen.queryByRole('button', { name: 'registration.cta.pay' })).not.toBeInTheDocument()
    expect(getRegistrationSpy).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(10_000)
    expect(getRegistrationSpy).toHaveBeenCalledTimes(2)
    await flushPromises()

    getRegistrationSpy.mockRestore()
  })

  it('builds payment verifying return path for successful payment redirect', () => {
    expect(`${Path.registrationOk({ eventId: 'test1', id: 'reg1' })}?payment=verifying`).toEqual(
      '/r/test1/reg1/saved?payment=verifying'
    )
  })

  it('shows snackbar when on saved route with payment success and picked', async () => {
    const routes: RouteObject[] = [
      {
        element: <RegistrationListPage />,
        path: '/r/:id/:registrationId/saved',
      },
      {
        element: <>Registration Page</>,
        path: '/r/:id/:registrationId',
      },
    ]

    render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <DataMemoryRouter
                  initialEntries={['/r/test1/paid-and-picked-nou-registration/saved']}
                  routes={routes}
                />
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith('registration.paidAndConfirmed to', {
      style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
      variant: 'success',
    })
    expect(screen.getByText('Registration Page')).toBeInTheDocument()
  })

  it('redirects to invitation attachment', async () => {
    renderWithRouter('/r/testInvited/invitation-attachment-registration/invitation')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    await flushPromises()

    expect(redirectTo).toHaveBeenCalledWith('/file/attachment-file/koekutsu-20210210-NOU.pdf')
  })

  it('hides cancel controls when event start is close', async () => {
    jest.setSystemTime(new Date('2021-02-09T00:00:00.000+02:00')) // must be before event.endDate
    renderWithRouter('/r/test1/nou-registration/cancel')

    expect(screen.queryByText('loading...')).toBeInTheDocument()
    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    expect(screen.getByText('registration.cancelDialog.lateText contact, event, registration')).toBeInTheDocument()
    expect(screen.queryByLabelText('registration.cancelDialog.reason')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'registration.cancelDialog.cta' })).not.toBeInTheDocument()
  })
})
