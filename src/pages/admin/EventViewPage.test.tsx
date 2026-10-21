import type { RouteObject } from 'react-router'
import type { TestStore } from 'test-utils/AtomProvider'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { act, screen } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { Suspense } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import {
  eventWithStaticDates,
  eventWithStaticDatesAnd3Classes,
  eventWithStaticDatesAndClass,
} from '../../__mockData__/events'
import { mockEvents } from '../../api/__mocks__/event'
import { putResultsPublished } from '../../api/event'
import { previewKennelliittoResults } from '../../api/registration'
import theme from '../../assets/Theme'
import { useEventSubscription } from '../../hooks/useEventSubscription'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import {
  DataMemoryRouter,
  flushPromises,
  renderSuspended,
  renderSuspendedWithUserEvents,
  runPendingTimers,
} from '../../test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import EventViewPage from './EventViewPage'
import { adminEventClassAtom, adminEventIdAtom, adminEventsAtom } from './state'

vi.mock('../../hooks/useEventSubscription', async () => ({
  useEventSubscription: vi.fn(() => ({ viewers: [] })),
}))

vi.mock('../state/user/derivedAtoms', async () => {
  const { atom } = await vi.importActual<typeof import('jotai')>('jotai')
  return {
    userAtom: atom(() => ({ id: 'user1', name: 'Current User' })),
    validIdTokenAtom: atom(() => 'id-token'),
  }
})

vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')
vi.mock('../../api/email')
vi.mock('../../api/user')

describe('EventViewPage', () => {
  const mockUseEventSubscription = vi.mocked(useEventSubscription)

  beforeAll(() => vi.useFakeTimers())
  afterEach(runPendingTimers)
  afterAll(() => vi.useRealTimers())

  beforeEach(() => {
    mockUseEventSubscription.mockReturnValue({ viewers: [] })
  })

  /** A trial Kennelliitto has with the chief judge, on the event page, and the store the page reads it from. */
  const readAt = new Date('2021-02-12T10:00:00Z')
  const handedOver = { ...eventWithStaticDates, kcState: { code: 1253, name: 'Ylituomarin hyväksyttäväksi', readAt } }
  const renderHandedOver = async () => {
    vi.mocked(previewKennelliittoResults).mockClear()
    let store: TestStore | undefined
    const rendered = await renderSuspendedWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider
            initializeState={(initial) => {
              store = initial
              initial.set(adminEventsAtom, [handedOver])
            }}
          >
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter
                    initialEntries={[Path.admin.viewEvent(handedOver.id)]}
                    routes={[{ element: <EventViewPage />, path: Path.admin.viewEvent() }]}
                  />
                </ConfirmProvider>
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()
    return { ...rendered, store }
  }

  it('reads the state of a trial with the chief judge with its panel closed, so a trial sent back opens again (KOE-1579)', async () => {
    const { store } = await renderHandedOver()
    const lastStep = () => screen.getAllByRole('listitem').at(-1)

    // The panel is closed, its handle all there is of it; the page reads the state all the same.
    expect(screen.getByRole('button', { name: 'eventManagement.open' })).toBeInTheDocument()
    expect(previewKennelliittoResults).toHaveBeenCalledWith('test1', [], 'id-token', undefined)
    expect(lastStep()).toHaveTextContent('event.states.resultsHandedOver')
    expect(lastStep()?.querySelector('.MuiStepIcon-root')).toHaveClass('Mui-completed')

    // What the read wrote onto the event arrives over the socket as a patch.
    await act(() =>
      store?.set(adminEventsAtom, [{ ...handedOver, kcState: { code: 754, name: 'Hyväksytty', readAt } }])
    )
    await flushPromises()

    expect(lastStep()).toHaveTextContent('event.states.sendResultsToKennelliitto')
    expect(lastStep()?.querySelector('.MuiStepIcon-root')).not.toHaveClass('Mui-completed')
  })

  it('reads the state again when the Omakoira section asks for it (KOE-1579)', async () => {
    const { user } = await renderHandedOver()
    expect(previewKennelliittoResults).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'eventManagement.open' }))
    await user.click(await screen.findByRole('button', { name: 'results.kennelliitto.refreshState' }))
    await flushPromises()

    expect(previewKennelliittoResults).toHaveBeenCalledTimes(2)
    expect(previewKennelliittoResults).toHaveBeenLastCalledWith('test1', [], 'id-token', undefined)
  })

  it('renders properly for event without classes', async () => {
    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter initialEntries={[Path.admin.viewEvent(eventWithStaticDates.id)]} routes={routes} />
                </ConfirmProvider>
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(screen.getByRole('link', { name: 'backToEventsList' })).toBeInTheDocument()
    // No explicit classes: the event's own type stands in as the one tab.
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([eventWithStaticDates.eventType])
  })

  it('offers a way back to the event list', async () => {
    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter initialEntries={[Path.admin.viewEvent(eventWithStaticDates.id)]} routes={routes} />
                </ConfirmProvider>
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()

    // KOE-541: the browser's own back button was the only way out of a trial opened from the list.
    expect(screen.getByRole('link', { name: 'backToEventsList' })).toHaveAttribute('href', Path.admin.events)
  })

  it('renders properly for event with classes', async () => {
    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter
                    initialEntries={[Path.admin.viewEvent(eventWithStaticDatesAndClass.id)]}
                    routes={routes}
                  />
                </ConfirmProvider>
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['ALO', 'AVO'])
  })

  it('uses the route event id instead of stale admin event selection state', async () => {
    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider
            initializeState={({ set }) => {
              set(adminEventIdAtom, 'stale-event-id')
              set(adminEventClassAtom, 'VOI')
            }}
          >
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter
                    initialEntries={[Path.admin.viewEvent(eventWithStaticDatesAndClass.id)]}
                    routes={routes}
                  />
                </ConfirmProvider>
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )

    await flushPromises()
    // The stale admin-selected class 'VOI' doesn't exist on this event; the route's own class wins.
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['ALO', 'AVO'])
    expect(screen.getByRole('tab', { name: 'ALO' })).toHaveAttribute('aria-selected', 'true')
  })

  it('gives a WT trial a tab of its own for the shared reserve list', async () => {
    // The reserve list of a WT trial belongs to the whole trial (KOE-912), so it gets a tab that
    // spans every class next to the per-class ones.
    const originalEventType = eventWithStaticDatesAnd3Classes.eventType
    eventWithStaticDatesAnd3Classes.eventType = 'NOWT'

    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    try {
      const { user } = await renderSuspendedWithUserEvents(
        <ThemeProvider theme={theme}>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
            <Provider>
              <Suspense fallback={<div>loading...</div>}>
                <AppSnackbarProvider>
                  <ConfirmProvider>
                    <DataMemoryRouter
                      initialEntries={[Path.admin.viewEvent(eventWithStaticDatesAnd3Classes.id)]}
                      routes={routes}
                    />
                  </ConfirmProvider>
                </AppSnackbarProvider>
              </Suspense>
            </Provider>
          </LocalizationProvider>
        </ThemeProvider>
      )
      await flushPromises()

      // Translations are not loaded in this suite, so the key stands in for the Finnish label.
      const sharedTab = screen.getByRole('tab', { name: 'eventManagement.allClasses' })
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'ALO',
        'AVO',
        'VOI',
        'eventManagement.allClasses',
      ])

      await user.click(sharedTab)
      await flushPromises()
      expect(sharedTab).toHaveAttribute('aria-selected', 'true')
    } finally {
      eventWithStaticDatesAnd3Classes.eventType = originalEventType
    }
  })

  it("does not add the shared reserve tab to a trial whose reserves are the class's own", async () => {
    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter
                    initialEntries={[Path.admin.viewEvent(eventWithStaticDatesAnd3Classes.id)]}
                    routes={routes}
                  />
                </ConfirmProvider>
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['ALO', 'AVO', 'VOI'])
  })

  it('hides one day of the results through the results endpoint (KOE-1510)', async () => {
    // The NOU trial ran on 10.2. and 11.2.; both days' results are out.
    const published = {
      ...eventWithStaticDates,
      id: 'results-published',
      resultsPublished: true,
      startListPublished: true,
      state: 'invited' as const,
    }
    mockEvents.push(published)
    const routes: RouteObject[] = [{ element: <EventViewPage />, path: Path.admin.viewEvent() }]

    try {
      const { user } = await renderSuspendedWithUserEvents(
        <ThemeProvider theme={theme}>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
            <Provider>
              <Suspense fallback={<div>loading...</div>}>
                <AppSnackbarProvider>
                  <ConfirmProvider>
                    <DataMemoryRouter initialEntries={[Path.admin.viewEvent(published.id)]} routes={routes} />
                  </ConfirmProvider>
                </AppSnackbarProvider>
              </Suspense>
            </Provider>
          </LocalizationProvider>
        </ThemeProvider>
      )
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'eventManagement.open' }))
      await flushPromises()
      const [firstDay] = screen.getAllByRole('button', { name: 'eventManagement.results.hide' })
      await user.click(firstDay)
      await flushPromises()

      expect(putResultsPublished).toHaveBeenCalledWith(
        published.id,
        { date: '2021-02-10', eventClass: undefined, published: false },
        'id-token'
      )
    } finally {
      mockEvents.splice(mockEvents.indexOf(published), 1)
    }
  })

  it('shows other viewers and hides the current user from the viewer banner', async () => {
    mockUseEventSubscription.mockReturnValue({
      viewers: [
        { name: 'Current User', userId: 'user1' },
        { name: 'Viewer Two', userId: 'user2' },
      ],
    })

    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter initialEntries={[Path.admin.viewEvent(eventWithStaticDates.id)]} routes={routes} />
                </ConfirmProvider>
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )

    await flushPromises()
    expect(await screen.findByRole('alert')).toHaveTextContent('event.viewerBanner_one count, names')
  })
})
