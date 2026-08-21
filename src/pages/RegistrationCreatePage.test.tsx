import type { RouteObject } from 'react-router'
import type { Registration } from '../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { screen } from '@testing-library/react'
import { format } from 'date-fns'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { eventWithStaticDates, eventWithStaticDatesAnd3Classes } from '../__mockData__/events'
import { registrationWithStaticDates } from '../__mockData__/registrations'
import * as eventApi from '../api/event'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { DataMemoryRouter, flushPromises, renderWithUserEvents } from '../test-utils/utils'
import { ErrorPage } from './ErrorPage'
import { Component as RegistrationCreatePage } from './RegistrationCreatePage'
import { newRegistrationAtom } from './recoil'

vi.mock('../api/user')
vi.mock('../api/event')
vi.mock('../api/eventType')
vi.mock('../api/judge')
vi.mock('../api/official')
vi.mock('../api/organizer')
vi.mock('../api/registration')

describe('RegistrationCreatePage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    vi.runOnlyPendingTimers()
    localStorage.clear()
    sessionStorage.clear()
  })
  afterAll(() => vi.useRealTimers())

  const renderWithRouter = (path: string, registration?: Registration) => {
    const routes: RouteObject[] = [
      {
        element: <RegistrationCreatePage />,
        errorElement: <ErrorPage />,
        hydrateFallbackElement: <>hydrate fallback</>,
        path: '/event/:eventType/:id',
      },
      {
        element: <RegistrationCreatePage />,
        hydrateFallbackElement: <>hydrate fallback</>,
        path: '/event/:eventType/:id/:class',
      },
      {
        element: <RegistrationCreatePage />,
        hydrateFallbackElement: <>hydrate fallback</>,
        path: '/event/:eventType/:id/:class/:date',
      },
      {
        element: <>registration list page</>,
        hydrateFallbackElement: <>hydrate fallback</>,
        path: '/r/:eventId/:registrationId',
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
      { advanceTimers: vi.advanceTimersByTime }
    )
  }

  it('should render with event/eventType/id path', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    const { eventType, id } = eventWithStaticDates
    const path = `/event/${eventType}/${id}`

    const { container } = renderWithRouter(path)
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('should select the class on event/eventType/id/class path', async () => {
    vi.setSystemTime(eventWithStaticDatesAnd3Classes.entryStartDate)
    const { eventType, id, classes } = eventWithStaticDatesAnd3Classes
    const path = `/event/${eventType}/${id}/${classes[1].class}`

    renderWithRouter(path)
    await flushPromises()
    const input = screen.getByRole('combobox', { name: 'registration.class' })
    expect(input).toHaveValue(classes[1].class)
  })

  it('should select the date on event/eventType/id/class/date path', async () => {
    vi.setSystemTime(eventWithStaticDatesAnd3Classes.entryStartDate)
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

    vi.setSystemTime(eventWithConfirmationPayment.entryStartDate)

    vi.spyOn(eventApi, 'getEvent').mockResolvedValueOnce(eventWithConfirmationPayment)
    const { user } = renderWithRouter(path, { ...registrationWithStaticDates, agreeToTerms: true, id: '' })
    await flushPromises()

    const saveButton = screen.getByRole('button', { name: 'registration.cta.confirmRegistration' })
    expect(saveButton).toBeEnabled()
    await user.click(saveButton)

    await flushPromises()

    expect(screen.getByText('registration list page')).toBeInTheDocument()
  })

  it('should throw 404 for non-existent event', async () => {
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const path = `/event/qwerty/asdf`

    vi.spyOn(eventApi, 'getEvent').mockRejectedValueOnce(new Error('not found'))
    const { container } = renderWithRouter(path)

    await flushPromises()
    expect(mockConsoleError).toHaveBeenCalled()
    expect(screen.getByText('error.eventNotFound')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })

  it('should throw 410 when entry is not open', async () => {
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    vi.setSystemTime(eventWithStaticDates.startDate)
    const { eventType, id } = eventWithStaticDates
    const path = `/event/${eventType}/${id}`

    vi.spyOn(eventApi, 'getEvent').mockResolvedValueOnce(eventWithStaticDates)
    const { container } = renderWithRouter(path)

    await flushPromises()
    expect(mockConsoleError).toHaveBeenCalled()
    expect(screen.getByText('error.entryNotOpen')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })
})
