import type { RouteObject } from 'react-router'
import type { Registration } from '../types'

import { Suspense } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { format } from 'date-fns'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates, eventWithStaticDatesAnd3Classes } from '../__mockData__/events'
import { registrationWithStaticDates } from '../__mockData__/registrations'
import * as eventApi from '../api/event'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { DataMemoryRouter, flushPromises, renderWithUserEvents } from '../test-utils/utils'

import { ErrorPage } from './ErrorPage'
import { newRegistrationAtom } from './recoil'
import { Component as RegistrationCreatePage } from './RegistrationCreatePage'

jest.mock('../api/user')
jest.mock('../api/event')
jest.mock('../api/eventType')
jest.mock('../api/judge')
jest.mock('../api/official')
jest.mock('../api/organizer')
jest.mock('../api/registration')

describe('RegistrationCreatePage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => {
    jest.runOnlyPendingTimers()
    localStorage.clear()
    sessionStorage.clear()
  })
  afterAll(() => jest.useRealTimers())

  const renderWithRouter = (path: string, registration?: Registration) => {
    const routes: RouteObject[] = [
      {
        path: '/event/:eventType/:id',
        element: <RegistrationCreatePage />,
        hydrateFallbackElement: <>hydrate fallback</>,
      },
      {
        path: '/event/:eventType/:id/:class',
        element: <RegistrationCreatePage />,
        hydrateFallbackElement: <>hydrate fallback</>,
      },
      {
        path: '/event/:eventType/:id/:class/:date',
        element: <RegistrationCreatePage />,
        hydrateFallbackElement: <>hydrate fallback</>,
      },
      {
        path: '/r/:eventId/:registrationId',
        element: <>registration list page</>,
        hydrateFallbackElement: <>hydrate fallback</>,
      },
    ]

    return renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot initializeState={registration ? ({ set }) => set(newRegistrationAtom, registration) : undefined}>
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
  }

  it('should render with event/eventType/id path', async () => {
    const { eventType, id } = eventWithStaticDates
    const path = `/event/${eventType}/${id}`

    const { container } = renderWithRouter(path)
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('should select the class on event/eventType/id/class path', async () => {
    const { eventType, id, classes } = eventWithStaticDatesAnd3Classes
    const path = `/event/${eventType}/${id}/${classes[1].class}`

    renderWithRouter(path)
    await flushPromises()
    const input = screen.getByRole('combobox', { name: 'registration.class' })
    expect(input).toHaveValue(classes[1].class)
  })

  it('should select the date on event/eventType/id/class/date path', async () => {
    const { eventType, id, classes } = eventWithStaticDatesAnd3Classes
    const date = format(classes[2].date ?? new Date(), 'dd.MM.')
    const path = `/event/${eventType}/${id}/${classes[2].class}/${date}`

    const { container } = renderWithRouter(path)
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('should navigate to registration details when paymentTime is confirmation', async () => {
    const eventWithConfirmationPayment = { ...eventWithStaticDates, paymentTime: 'confirmation' as const }
    const { eventType, id } = eventWithConfirmationPayment
    const path = `/event/${eventType}/${id}`

    jest.setSystemTime(eventWithConfirmationPayment.entryStartDate)

    jest.spyOn(eventApi, 'getEvents').mockResolvedValueOnce([eventWithConfirmationPayment])
    const { user } = renderWithRouter(path, { ...registrationWithStaticDates, id: '', agreeToTerms: true })
    await flushPromises()

    const saveButton = screen.getByRole('button', { name: 'Vahvista ilmoittautuminen' })
    expect(saveButton).toBeEnabled()
    await user.click(saveButton)

    await flushPromises()

    expect(screen.getByText('registration list page')).toBeInTheDocument()
  })

  it('should throw 404 for non-existent event', async () => {
    const mockConsoleError = jest.spyOn(console, 'error').mockImplementation()

    const path = `/event/qwerty/asdf`
    const routes: RouteObject[] = [
      {
        path: '/event/:eventType/:id',
        element: <RegistrationCreatePage />,
        errorElement: <ErrorPage />,
        hydrateFallbackElement: <>hydrate fallback</>,
      },
    ]

    render(
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
      </ThemeProvider>
    )

    await flushPromises()
    expect(mockConsoleError).toHaveBeenCalled()
    expect(screen).toMatchSnapshot()
  })
})
