import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates, eventWithStaticDatesAndClass } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { useEventSubscription } from '../../hooks/useEventSubscription'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises } from '../../test-utils/utils'
import EventViewPage from './EventViewPage'
import { adminEventClassAtom, adminEventIdAtom } from './state'

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
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  beforeEach(() => {
    mockUseEventSubscription.mockReturnValue({ viewers: [] })
  })

  it('renders properly for event without classes', async () => {
    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter initialEntries={[Path.admin.viewEvent(eventWithStaticDates.id)]} routes={routes} />
                </ConfirmProvider>
              </SnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('renders properly for event with classes', async () => {
    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter
                    initialEntries={[Path.admin.viewEvent(eventWithStaticDatesAndClass.id)]}
                    routes={routes}
                  />
                </ConfirmProvider>
              </SnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('uses the route event id instead of stale admin event selection state', async () => {
    const routes: RouteObject[] = [
      {
        element: <EventViewPage />,
        path: Path.admin.viewEvent(),
      },
    ]

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider
            initializeState={({ set }) => {
              set(adminEventIdAtom, 'stale-event-id')
              set(adminEventClassAtom, 'VOI')
            }}
          >
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter
                    initialEntries={[Path.admin.viewEvent(eventWithStaticDatesAndClass.id)]}
                    routes={routes}
                  />
                </ConfirmProvider>
              </SnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )

    await flushPromises()
    expect(container).toMatchSnapshot()
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

    render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <ConfirmProvider>
                  <DataMemoryRouter initialEntries={[Path.admin.viewEvent(eventWithStaticDates.id)]} routes={routes} />
                </ConfirmProvider>
              </SnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )

    await flushPromises()
    expect(await screen.findByRole('alert')).toHaveTextContent('event.viewerBanner_one count, names')
  })
})
