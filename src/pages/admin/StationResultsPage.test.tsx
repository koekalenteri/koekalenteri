import type { UserEvent } from '@testing-library/user-event'
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
import { eventWithStations, registrationsToEventWithStations } from '../../__mockData__/resultsEvent'
import { putEventResults } from '../../api/registration'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises, renderWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import StationResultsPage from './StationResultsPage'
import { adminEventRegistrationsAtom, adminEventsAtom } from './state'

vi.mock('../../api/user')
vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')

const renderPage = (language: Language, stationId: string) => {
  const routes: RouteObject[] = [{ element: <StationResultsPage />, path: Path.admin.stationResults() }]

  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <DataMemoryRouter
                initialEntries={[Path.admin.stationResults(eventWithStaticDates.id, stationId)]}
                routes={routes}
              />
            </SnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
}

/** The post's own screen, on a course that exists and has dogs queued for it. */
const renderStation = (language: Language, stationId = 'post-2') => {
  const routes: RouteObject[] = [{ element: <StationResultsPage />, path: Path.admin.stationResults() }]

  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventsAtom, [eventWithStations])
            set(adminEventRegistrationsAtom(eventWithStations.id), registrationsToEventWithStations)
          }}
        >
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <DataMemoryRouter
                initialEntries={[Path.admin.stationResults(eventWithStations.id, stationId)]}
                routes={routes}
              />
            </SnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
}

/** Enter a score and let the debounced change land before anything else happens. */
const score = async (user: UserEvent, input: HTMLElement, points: string) => {
  await user.type(input, points)
  await flushPromises()
}

describe('StationResultsPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
  })
  afterAll(() => vi.useRealTimers())

  it('will not open on a post the event does not have', async () => {
    const { i18n } = useTranslation()
    renderPage(i18n.language as Language, 'no-such-post')
    await flushPromises()

    // The post is part of the address, so a stale link must not land on an empty scoring screen.
    expect(screen.getByText('error.eventNotFound')).toBeInTheDocument()
  })

  it('names the post and queues the dogs due through it', async () => {
    const { i18n } = useTranslation()
    renderStation(i18n.language as Language)
    await flushPromises()

    expect(screen.getByText(/event\.station/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 Ensimmainen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2 Toinen' })).toBeInTheDocument()
    // A reserve that was never called up is not in anyone's queue.
    expect(screen.queryByRole('button', { name: /Varalla/ })).not.toBeInTheDocument()
  })

  it('scores only the tasks its own post sets', async () => {
    const { i18n } = useTranslation()
    const { user } = renderStation(i18n.language as Language)
    await flushPromises()

    await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
    await flushPromises()

    // Post 2 splits its 20 points in two. Post 1's task belongs to whoever is standing there.
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
  })

  it('withholds the prize, which depends on posts it cannot see', async () => {
    const { i18n } = useTranslation()
    const { user } = renderStation(i18n.language as Language)
    await flushPromises()

    await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
    await flushPromises()
    await score(user, screen.getAllByRole('textbox')[0], '10')

    // A partial figure here would read as a verdict, and it would be the wrong one.
    expect(screen.queryByText('ALO1')).not.toBeInTheDocument()
    expect(screen.queryByText(/results\.runningTotal/)).not.toBeInTheDocument()
  })

  it('moves on to the next dog that has not been through, since at a post the queue is the job', async () => {
    const { i18n } = useTranslation()
    const { user } = renderStation(i18n.language as Language)
    await flushPromises()

    await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
    await flushPromises()
    await score(user, screen.getAllByRole('textbox')[0], '10')
    await score(user, screen.getAllByRole('textbox')[1], '10')

    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    expect(putEventResults).toHaveBeenCalledOnce()
    // Scoped to this post, so the save cannot carry away what another post recorded for the same dog.
    const [, submissions] = vi.mocked(putEventResults).mock.lastCall ?? []
    expect(submissions?.[0]).toMatchObject({ id: 'run-1', stationId: 'post-2' })

    // The dog just scored is behind us; the screen is already on the next one in the queue.
    expect(screen.getByRole('heading', { name: /Toinen/ })).toBeInTheDocument()
  })
})
