import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import type { Registration } from '../../types'
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
