import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import type { Registration, RegistrationClass } from '../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { cleanup, screen, within } from '@testing-library/react'
import { addDays } from 'date-fns'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStations, registrationsToEventWithStations } from '../../__mockData__/resultsEvent'
import { putStartNumbers } from '../../api/event'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises, renderWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import EventStartNumbersPage from './EventStartNumbersPage'
import { adminEventRegistrationsAtom, adminEventsAtom } from './state'

vi.mock('../../api/user')
vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')

const renderPage = (language: Language, registrations: Registration[] = registrationsToEventWithStations) => {
  const routes: RouteObject[] = [{ element: <EventStartNumbersPage />, path: Path.admin.startNumbers() }]

  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventsAtom, [eventWithStations])
            set(adminEventRegistrationsAtom(eventWithStations.id), registrations)
          }}
        >
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <DataMemoryRouter initialEntries={[Path.admin.startNumbers(eventWithStations.id)]} routes={routes} />
            </SnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
}

const rowFor = (dogName: string): HTMLElement => {
  const row = screen.getByText(dogName).closest('tr')
  if (!row) throw new Error(`no row for ${dogName}`)
  return row
}

describe('EventStartNumbersPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
  })
  afterAll(() => vi.useRealTimers())

  it('lists the dogs that ran with a number field each, and leaves the reserve out', async () => {
    const { i18n } = useTranslation()
    renderPage(i18n.language as Language)
    await flushPromises()

    expect(screen.getByText('Ensimmainen')).toBeInTheDocument()
    expect(screen.getByText('Toinen')).toBeInTheDocument()
    expect(screen.queryByText('Varalla')).not.toBeInTheDocument()
    expect(within(rowFor('Ensimmainen')).getByRole('textbox')).toBeInTheDocument()
  })

  it('saves only the entered numbers, as one batch for the class', async () => {
    const { i18n } = useTranslation()
    const { user } = renderPage(i18n.language as Language)
    await flushPromises()

    await user.type(within(rowFor('Ensimmainen')).getByRole('textbox'), '7')
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'startNumbers.save' }))
    await flushPromises()

    expect(putStartNumbers).toHaveBeenCalledWith(
      'test-results',
      { eventClass: 'ALO', numbers: [{ id: 'run-1', startNumber: 7 }] },
      TEST_ID_TOKEN
    )
  })

  it('lists a multi-day class one day at a time, and names the day on each row', async () => {
    const { i18n } = useTranslation()
    const [first, second] = registrationsToEventWithStations
    const nextDay = addDays(first.group?.date ?? new Date(), 1)
    const { user } = renderPage(i18n.language as Language, [
      first,
      second,
      // A dog whose draw is the next morning (KOE-1303) — the frozen placement decides its day.
      {
        ...second,
        dog: { ...second.dog, name: 'Kolmas', regNo: 'REG-run-3' },
        group: { date: nextDay, key: 'ALO-AP-2', number: 3, time: 'ap' },
        id: 'run-3',
        startGroup: { date: nextDay, key: 'ALO-AP-2', number: 25, time: 'ap' },
      },
      // Another class's dog holds 30: the number is one dog's in the whole trial.
      {
        ...second,
        class: 'AVO',
        dog: { ...second.dog, name: 'Neljas', regNo: 'REG-run-4' },
        group: { date: first.group?.date, key: 'AVO-AP', number: 4, time: 'ap' },
        id: 'run-4',
        startGroup: { date: first.group?.date, key: 'AVO-AP', number: 30, time: 'ap' },
      },
    ])
    await flushPromises()

    expect(screen.getByText('Ensimmainen')).toBeInTheDocument()
    expect(screen.queryByText('Kolmas')).not.toBeInTheDocument()
    expect(
      within(rowFor('Ensimmainen')).getByText('dateFormat.wdshort date registration.timeLong.ap')
    ).toBeInTheDocument()

    const days = screen.getAllByRole('button', { pressed: false })
    await user.click(days[0])
    await flushPromises()

    expect(screen.queryByText('Ensimmainen')).not.toBeInTheDocument()
    expect(screen.getByText('Kolmas')).toBeInTheDocument()
    expect(within(rowFor('Kolmas')).getByRole('textbox')).toHaveValue('25')

    // One number, one dog, whichever day or class it runs in: 25 is Saturday's, so Friday's dog
    // cannot take it, and 30 belongs to the AVO dog behind the other class tab.
    await user.click(screen.getAllByRole('button', { pressed: false })[0])
    await flushPromises()
    await user.type(within(rowFor('Ensimmainen')).getByRole('textbox'), '25')
    await flushPromises()
    expect(screen.getByText('startNumbers.duplicate')).toBeInTheDocument()
    await user.clear(within(rowFor('Ensimmainen')).getByRole('textbox'))
    await user.type(within(rowFor('Ensimmainen')).getByRole('textbox'), '30')
    await flushPromises()
    expect(screen.getByText('startNumbers.duplicate')).toBeInTheDocument()
  })

  it('picks the day before the class, and holds it while the classes are worked through (KOE-1350)', async () => {
    const { i18n } = useTranslation()
    const [first] = registrationsToEventWithStations
    const friday = first.group?.date ?? new Date()
    const saturday = addDays(friday, 1)
    const dog = (
      id: string,
      name: string,
      eventClass: RegistrationClass,
      date: Date,
      number: number
    ): Registration => ({
      ...first,
      class: eventClass,
      dog: { ...first.dog, name, regNo: `REG-${id}` },
      group: { date, key: `${eventClass}-AP`, number, time: 'ap' },
      id,
    })

    const { user } = renderPage(i18n.language as Language, [
      dog('run-1', 'AloPerjantai', 'ALO', friday, 1),
      dog('run-2', 'AloLauantai', 'ALO', saturday, 2),
      dog('run-3', 'AvoPerjantai', 'AVO', friday, 3),
      dog('run-4', 'AvoLauantai', 'AVO', saturday, 4),
    ])
    await flushPromises()

    // The day comes first on screen: the secretary works a morning, then moves through its classes.
    const dayGroup = screen.getByRole('group')
    const classTabs = screen.getByRole('tablist')
    expect(dayGroup.compareDocumentPosition(classTabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Friday to begin with, and its own two classes to choose from.
    expect(screen.getByText('AloPerjantai')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['ALO', 'AVO'])

    // Changing class leaves the day where it was.
    await user.click(screen.getByRole('tab', { name: 'AVO' }))
    await flushPromises()
    expect(screen.getByText('AvoPerjantai')).toBeInTheDocument()
    expect(screen.queryByText('AvoLauantai')).not.toBeInTheDocument()

    // And changing day leaves the class where it was.
    await user.click(screen.getAllByRole('button', { pressed: false })[0])
    await flushPromises()
    expect(screen.getByText('AvoLauantai')).toBeInTheDocument()
    expect(screen.queryByText('AvoPerjantai')).not.toBeInTheDocument()
  })

  it('offers only the classes that run on the chosen day (KOE-1350)', async () => {
    const { i18n } = useTranslation()
    const [first] = registrationsToEventWithStations
    const friday = first.group?.date ?? new Date()
    const saturday = addDays(friday, 1)

    const { user } = renderPage(i18n.language as Language, [
      { ...first, group: { date: friday, key: 'ALO-AP', number: 1, time: 'ap' }, id: 'run-1' },
      {
        ...first,
        class: 'AVO',
        dog: { ...first.dog, name: 'AvoLauantai', regNo: 'REG-run-2' },
        group: { date: saturday, key: 'AVO-AP', number: 2, time: 'ap' },
        id: 'run-2',
      },
    ])
    await flushPromises()

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['ALO'])

    // AVO runs on Saturday only, so it is the Saturday sheet that offers it — and ALO is gone from it.
    await user.click(screen.getAllByRole('button', { pressed: false })[0])
    await flushPromises()

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['AVO'])
    expect(screen.getByText('AvoLauantai')).toBeInTheDocument()
  })

  it('flags a duplicate as it is typed', async () => {
    const { i18n } = useTranslation()
    const { user } = renderPage(i18n.language as Language)
    await flushPromises()

    await user.type(within(rowFor('Ensimmainen')).getByRole('textbox'), '5')
    await user.type(within(rowFor('Toinen')).getByRole('textbox'), '5')
    await flushPromises()

    // The form catches the same pair of eyes typing twice; the server catches two phones.
    expect(screen.getAllByText('startNumbers.duplicate')).toHaveLength(2)
  })
})
