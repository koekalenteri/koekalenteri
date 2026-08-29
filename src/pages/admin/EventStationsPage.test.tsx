import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { cleanup, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises, renderWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import EventStationsPage from './EventStationsPage'

vi.mock('../../api/user')
vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')

const renderPage = (language: Language) => {
  const routes: RouteObject[] = [{ element: <EventStationsPage />, path: Path.admin.stations() }]

  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <DataMemoryRouter initialEntries={[Path.admin.stations(eventWithStaticDates.id)]} routes={routes} />
            </SnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
}

describe('EventStationsPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
  })
  afterAll(() => vi.useRealTimers())

  it('finds the event and offers its posts for editing', async () => {
    const { i18n } = useTranslation()
    renderPage(i18n.language as Language)
    await flushPromises()

    expect(screen.queryByText('error.eventNotFound')).not.toBeInTheDocument()
    // The mock event runs over two days, and a course is built per day.
    expect(screen.getAllByRole('button', { name: 'event.stationAdd' })).toHaveLength(2)
  })

  it('keeps the event after the first edit', async () => {
    const { i18n } = useTranslation()
    const { user } = renderPage(i18n.language as Language)
    await flushPromises()

    await user.click(screen.getAllByRole('button', { name: 'event.stationAdd' })[0])
    await flushPromises()

    // The editor emits a patch. Storing that as the whole event would drop its id, and the page would
    // claim the event does not exist the moment anything was changed.
    expect(screen.queryByText('error.eventNotFound')).not.toBeInTheDocument()
    expect(screen.getByText('event.station 1')).toBeInTheDocument()
  })

  it("reports what it saved, not the event's publication state", async () => {
    const { i18n } = useTranslation()
    const { user } = renderPage(i18n.language as Language)
    await flushPromises()

    await user.click(screen.getAllByRole('button', { name: 'event.stationAdd' })[0])
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    // The shared form hook otherwise announces "event published", which is not what happened here.
    expect(screen.getByText('event.stationsSaved')).toBeInTheDocument()
  })
})
