import type { UserEvent } from '@testing-library/user-event'
import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import type { ConfirmedEvent } from '../../types'
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
import { putEvent } from '../../api/event'
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
vi.mock('../../hooks/useEventSubscription', () => ({ useEventSubscription: vi.fn(() => ({ viewers: [] })) }))
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')
vi.mock('../../api/station')

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
const renderStation = (language: Language, stationId = 'post-2', event = eventWithStations) => {
  const routes: RouteObject[] = [{ element: <StationResultsPage />, path: Path.admin.stationResults() }]

  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventsAtom, [event])
            set(adminEventRegistrationsAtom(event.id), registrationsToEventWithStations)
          }}
        >
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <DataMemoryRouter initialEntries={[Path.admin.stationResults(event.id, stationId)]} routes={routes} />
            </SnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
}

/**
 * A NOME-B: the same dogs, but no course laid out, because the format runs its day at one post that
 * nobody configures. Its own screen is the implicit post, numbered 1.
 */
const singlePostEvent: ConfirmedEvent = { ...eventWithStations, eventType: 'NOME-B', stations: undefined }

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

  it('copies the tokenized station link for sharing', async () => {
    const { i18n } = useTranslation()
    const { user } = renderStation(i18n.language as Language)
    await flushPromises()

    // Defined after render on purpose: userEvent's setup installs its own clipboard stub, and this
    // must land on top of it to observe the page's write.
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

    await user.click(screen.getByRole('button', { name: 'results.copyStationLink' }))
    await flushPromises()

    const { getStationLink } = await import('../../api/station')
    expect(getStationLink).toHaveBeenCalledWith('test-results', 'post-2', TEST_ID_TOKEN)
    // The mock mints `token-<stationId>`; what lands on the clipboard is the shareable public path.
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/station/test-results/post-2/access/token-post-2'))
  })

  it('opens on the implicit post of a format that lays out no course', async () => {
    const { i18n } = useTranslation()
    renderStation(i18n.language as Language, '1', singlePostEvent)
    await flushPromises()

    // Nothing is stored for the post, yet the day is run from here: the queue is up and the link is
    // there to hand out.
    expect(screen.getByRole('button', { name: '1 Ensimmainen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'results.copyStationLink' })).toBeInTheDocument()
  })

  it('writes the implicit post onto the event when its link is revoked, so the version has a home', async () => {
    const { i18n } = useTranslation()
    const { user } = renderStation(i18n.language as Language, '1', singlePostEvent)
    await flushPromises()
    // The mock store knows nothing of this event; the save only has to be observed, not stored.
    vi.mocked(putEvent).mockResolvedValueOnce(singlePostEvent)

    await user.click(screen.getByRole('button', { name: 'results.revokeStationLink' }))
    await flushPromises()

    expect(putEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: singlePostEvent.id,
        stations: [{ date: singlePostEvent.startDate, id: '1', number: 1, tasks: 1, tokenVersion: 2 }],
      }),
      TEST_ID_TOKEN
    )
  })

  it("writes the phases of a B trial's day onto its post, as the secretary types them", async () => {
    const { i18n } = useTranslation()
    const { user } = renderStation(i18n.language as Language, '1', singlePostEvent)
    await flushPromises()
    vi.mocked(putEvent).mockResolvedValueOnce(singlePostEvent)

    await user.type(screen.getByLabelText('liveStatus.phases'), 'Markkeeraus, Haku')
    await user.tab()
    await flushPromises()

    expect(putEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stations: [expect.objectContaining({ id: '1', phases: ['Markkeeraus', 'Haku'] })],
      }),
      TEST_ID_TOKEN
    )
  })

  it('marks a dog as done the moment its result is stored, so the post does not score it twice', async () => {
    const { i18n } = useTranslation()
    const { user } = renderStation(i18n.language as Language, '1', singlePostEvent)
    await flushPromises()
    const judge = { id: 223, name: 'Tuomari 2' }
    vi.mocked(putEventResults).mockResolvedValueOnce({
      conflicts: [],
      saved: [{ eventResult: { judge, result: 'ALO1', updatedAt: new Date(), updatedBy: 'x' }, id: 'run-1' }],
      unchanged: [],
    })

    await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
    await user.click(screen.getByLabelText('results.column.result'))
    await user.click(screen.getByRole('option', { name: 'ALO1' }))
    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    expect(screen.getByRole('button', { name: '1 Ensimmainen' })).toHaveClass('MuiChip-filled')
    expect(screen.getByRole('button', { name: '2 Toinen' })).toHaveClass('MuiChip-outlined')
  })

  it('leads back to the results page the secretary came from', async () => {
    const { i18n } = useTranslation()
    renderStation(i18n.language as Language)
    await flushPromises()

    expect(screen.getByRole('link', { name: 'results.backToResults' })).toHaveAttribute(
      'href',
      Path.admin.results(eventWithStations.id)
    )
  })

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
