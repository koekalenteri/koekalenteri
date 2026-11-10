import type { RouteObject } from 'react-router'
import type { Registration } from '../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { screen } from '@testing-library/react'
import { format } from 'date-fns'
import { Suspense } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { registrationDogAged20MonthsAndNoResults } from '../__mockData__/dogs'
import { eventWithStaticDates, eventWithStaticDatesAnd3Classes } from '../__mockData__/events'
import { registrationWithStaticDates } from '../__mockData__/registrations'
import * as eventApi from '../api/event'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { DataMemoryRouter, flushPromises, renderWithUserEvents, runPendingTimers } from '../test-utils/utils'
import AppSnackbarProvider from './components/AppSnackbarProvider'
import { ErrorPage } from './ErrorPage'
import { Component as RegistrationCreatePage } from './RegistrationCreatePage'
import { newRegistrationAtom } from './state'

vi.mock('../api/dog')
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
    runPendingTimers()
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
          <Provider initializeState={registration ? ({ set }) => set(newRegistrationAtom, registration) : undefined}>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
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

    renderWithRouter(path)
    await flushPromises()
    expect(screen.getByRole('link', { name: 'goHome' })).toBeInTheDocument()
    expect(screen.getByText(eventWithStaticDates.location, { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'entryTitle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'registration.cta.confirmAndPay' })).toBeInTheDocument()
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

    renderWithRouter(path)
    await flushPromises()
    expect(screen.getByRole('combobox', { name: 'registration.class' })).toHaveValue(classes[2].class)
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

  // The draft stays for the next dog after a save that pays later; its team does not (KOE-1721).
  const storedDraft = () => JSON.parse(sessionStorage.getItem('newRegistration') ?? '{}')
  const team = { name: 'Kultaiset', primary: true as const }

  it('leaves the team out of the draft the next entry starts from', async () => {
    const eventWithConfirmationPayment = {
      ...eventWithStaticDates,
      paymentTime: 'confirmation' as const,
      teamCompetition: { askAtEntry: true },
    }
    const { eventType, id } = eventWithConfirmationPayment
    vi.setSystemTime(eventWithConfirmationPayment.entryStartDate)
    vi.spyOn(eventApi, 'getEvent').mockResolvedValueOnce(eventWithConfirmationPayment)

    const { user } = renderWithRouter(`/event/${eventType}/${id}`, {
      ...registrationWithStaticDates,
      agreeToTerms: true,
      id: '',
      teamEntry: team,
    })
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'registration.cta.confirmRegistration' }))
    await flushPromises()

    expect(screen.getByText('registration list page')).toBeInTheDocument()
    expect(storedDraft()).toMatchObject({ dog: { regNo: registrationWithStaticDates.dog.regNo } })
    expect(storedDraft()).not.toHaveProperty('teamEntry')
  })

  // The team section comes before the dog: what the registrant typed there stays when they fetch the dog.
  it('keeps the team typed before the dog is fetched', async () => {
    const eventAskingTeam = { ...eventWithStaticDates, teamCompetition: { askAtEntry: true } }
    const { eventType, id } = eventAskingTeam
    vi.setSystemTime(eventAskingTeam.entryStartDate)
    vi.spyOn(eventApi, 'getEvent').mockResolvedValueOnce(eventAskingTeam)

    const { user } = renderWithRouter(`/event/${eventType}/${id}`)
    await flushPromises()
    await user.type(screen.getByRole('textbox', { name: 'registration.teamEntryName' }), team.name)
    await flushPromises()
    await user.click(screen.getByRole('checkbox', { name: 'registration.teamEntryPrimary' }))
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'registration.dog' }))
    await flushPromises()
    await user.type(screen.getByRole('combobox', { name: 'dog.regNo' }), registrationDogAged20MonthsAndNoResults.regNo)
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'registration.cta.fetch' }))
    await flushPromises()

    expect(storedDraft()).toMatchObject({
      dog: { regNo: registrationDogAged20MonthsAndNoResults.regNo },
      teamEntry: team,
    })
  })

  it('leaves the team out of a draft that comes from another trial', async () => {
    vi.setSystemTime(eventWithStaticDates.entryStartDate)
    const { eventType, id } = eventWithStaticDates

    renderWithRouter(`/event/${eventType}/${id}`, {
      ...registrationWithStaticDates,
      eventId: 'another-trial',
      teamEntry: team,
    })
    await flushPromises()

    expect(storedDraft()).toMatchObject({ eventId: id })
    expect(storedDraft()).not.toHaveProperty('teamEntry')
  })

  it('should throw 404 for non-existent event', async () => {
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const path = `/event/qwerty/asdf`

    vi.spyOn(eventApi, 'getEvent').mockRejectedValueOnce(new Error('not found'))
    renderWithRouter(path)

    await flushPromises()
    expect(mockConsoleError).toHaveBeenCalled()
    expect(screen.getByText('error.eventNotFound')).toBeInTheDocument()
  })

  it('should throw 410 when entry is not open', async () => {
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    vi.setSystemTime(eventWithStaticDates.startDate)
    const { eventType, id } = eventWithStaticDates
    const path = `/event/${eventType}/${id}`

    vi.spyOn(eventApi, 'getEvent').mockResolvedValueOnce(eventWithStaticDates)
    renderWithRouter(path)

    await flushPromises()
    expect(mockConsoleError).toHaveBeenCalled()
    expect(screen.getByText('error.entryNotOpen')).toBeInTheDocument()
  })
})
