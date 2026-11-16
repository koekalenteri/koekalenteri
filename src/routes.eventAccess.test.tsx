import { Authenticator } from '@aws-amplify/ui-react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { screen } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { Suspense } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from './__mockData__/events'
import { getRegistrations, getStartListPreview } from './api/registration'
import theme from './assets/Theme'
import { useEventSubscription } from './hooks/useEventSubscription'
import { locales } from './i18n'
import { adminEventsAtom } from './pages/admin/state'
import AppSnackbarProvider from './pages/components/AppSnackbarProvider'
import { idTokenAtom } from './pages/state'
import { Path } from './routeConfig'
import routes from './routes'
import { DataMemoryRouter, flushPromises, renderSuspended, TEST_ID_TOKEN } from './test-utils/utils'

vi.mock('./api/email')
vi.mock('./api/event')
vi.mock('./api/eventType')
vi.mock('./api/judge')
vi.mock('./api/official')
vi.mock('./api/organizer')
vi.mock('./api/registration')
vi.mock('./api/user')
// The real Authenticator.Provider asks Amplify for the session; unconfigured, Amplify warns on every render.
vi.mock('@aws-amplify/ui-react', () => import('./__mocks__/aws-amplify/ui-react'))
vi.mock('./hooks/useAdminSubscription', () => ({ useAdminSubscription: vi.fn() }))
vi.mock('./hooks/useEventSubscription', () => ({ useEventSubscription: vi.fn(() => ({ viewers: [] })) }))

/** An event of a club the secretary has no role in: the admin list, which holds only their own, lacks it. */
const OTHER_CLUBS_EVENT = 'another-clubs-event'

const renderPath = async (path: string) => {
  await renderSuspended(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventsAtom, [eventWithStaticDates])
          }}
        >
          <AppSnackbarProvider>
            <ConfirmProvider>
              <Authenticator.Provider>
                <Suspense fallback={<div>loading...</div>}>
                  <DataMemoryRouter initialEntries={[path]} routes={routes} />
                </Suspense>
              </Authenticator.Provider>
            </ConfirmProvider>
          </AppSnackbarProvider>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>
  )
  await flushPromises()
}

describe('the admin pages of one event', () => {
  // The routes load their pages on navigation. Loaded once here, a render settles within the act
  // rounds of flushPromises; waiting outside act for a slow first import would let React update
  // the tree where the test cannot see it.
  beforeAll(async () => {
    await Promise.all([
      import('./pages/admin/AdminHomePage'),
      import('./pages/admin/components/AdminEventGate'),
      import('./pages/admin/EventEditPage'),
      import('./pages/admin/EventViewPage'),
      import('./pages/admin/EventStationsPage'),
      import('./pages/admin/EventTeamsPage'),
      import('./pages/admin/EventStartNumbersPage'),
      import('./pages/admin/EventResultsPage'),
      import('./pages/admin/StationResultsPage'),
      import('./pages/admin/StartListPage'),
      import('./pages/admin/StartListPreviewPage'),
    ])
  }, 60_000)

  beforeEach(() => {
    vi.mocked(getRegistrations).mockReset()
    vi.mocked(getStartListPreview).mockReset()
    vi.mocked(useEventSubscription).mockClear()
  })

  // KOE-1738: another club's trial showed a spinner that never went away, or "something went wrong",
  // since each page read the entries (403) and subscribed to the trial before it found the trial
  // was not on the secretary's list.
  it.each([
    ['edit', Path.admin.editEvent(OTHER_CLUBS_EVENT)],
    ['view', Path.admin.viewEvent(OTHER_CLUBS_EVENT)],
    ['stations', Path.admin.stations(OTHER_CLUBS_EVENT)],
    ['teams', Path.admin.teams(OTHER_CLUBS_EVENT)],
    ['start numbers', Path.admin.startNumbers(OTHER_CLUBS_EVENT)],
    ['results', Path.admin.results(OTHER_CLUBS_EVENT)],
    ['station results', Path.admin.stationResults(OTHER_CLUBS_EVENT, 'post-1')],
    ['start list', Path.admin.startList(OTHER_CLUBS_EVENT)],
    ['start list preview', Path.admin.startListPreview(OTHER_CLUBS_EVENT)],
  ])("the %s page of another club's event says it is not found and reads nothing of it", async (_page, path) => {
    vi.mocked(getRegistrations).mockRejectedValue(new Error('Forbidden'))
    vi.mocked(getStartListPreview).mockRejectedValue(new Error('Forbidden'))

    await renderPath(path)

    expect(screen.getByText('error.eventNotFound')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'backToEventsList' })).toHaveAttribute('href', Path.admin.events)
    expect(getRegistrations).not.toHaveBeenCalled()
    expect(getStartListPreview).not.toHaveBeenCalled()
    expect(useEventSubscription).not.toHaveBeenCalled()
  })

  it("an event on the secretary's list opens its page", async () => {
    await renderPath(Path.admin.startNumbers(eventWithStaticDates.id))

    expect(getRegistrations).toHaveBeenCalledWith(eventWithStaticDates.id, TEST_ID_TOKEN)
    expect(screen.queryByText('error.eventNotFound')).not.toBeInTheDocument()
  })
})
