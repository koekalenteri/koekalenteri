import type { ConfirmedEvent, Registration } from '../../types'
import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { render } from 'vitest-browser-react'
import { emptyEvent } from '../../__mockData__/emptyEvent'
import { registrationWithStaticDates } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import { TIME_ZONE } from '../../i18n/dates'
import { Path } from '../../routeConfig'
import { TestProvider } from '../../test-utils/AtomProvider'
import { DataMemoryRouter, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import EventViewPage from './EventViewPage'
import { adminEventRegistrationsAtom, adminEventsAtom } from './state'

// The page renders inside a real WebSocketProvider in production; give it a no-op subscription
// instead, the same way EventViewPage.test.tsx does.
vi.mock(import('../../hooks/useEventSubscription'), () => ({
  useEventSubscription: () => ({ viewers: [] }),
}))

vi.mock(import('../../api/user'), async (importOriginal) => ({
  ...(await importOriginal()),
  getUser: async () => ({ admin: true, email: 'admin@example.com', id: 'admin', name: 'Anna Admin' }),
}))

vi.mock(import('../../api/email'), async (importOriginal) => ({
  ...(await importOriginal()),
  getEmailTemplates: async () => [],
}))

const day = (iso: string) => new TZDate(iso, TIME_ZONE)
const start = day('2026-10-10')
const end = day('2026-10-11')

const event: ConfirmedEvent = {
  ...emptyEvent,
  classes: [
    { class: 'ALO', date: start },
    { class: 'AVO', date: end },
  ],
  endDate: end,
  entries: 2,
  entryEndDate: day('2026-09-27'),
  entryStartDate: day('2026-09-01'),
  eventType: 'NOME-B',
  id: 'view-event',
  judges: [{ id: 123, name: 'Tuomari 1', official: true }],
  places: 20,
  startDate: start,
  state: 'confirmed',
}

const registrations: Registration[] = [
  { ...registrationWithStaticDates, class: 'ALO', eventId: event.id, id: 'reg-1' },
  { ...registrationWithStaticDates, class: 'AVO', eventId: event.id, id: 'reg-2' },
]

it("shows the event's status row, info panel and class tabs above the entry grid", async () => {
  const screen = await render(
    // A fixed height with overflow hidden crops the capture to the page's own structure -- the
    // entry grid underneath already has its own coverage from KOE-1322.
    <div data-testid="visual-root" style={{ background: '#fff', height: 230, overflow: 'hidden', width: 1200 }}>
      <ThemeProvider theme={theme}>
        <TestProvider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventsAtom, [event])
            set(adminEventRegistrationsAtom(event.id), registrations)
          }}
        >
          <SnackbarProvider>
            <ConfirmProvider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter
                  initialEntries={[Path.admin.viewEvent(event.id)]}
                  routes={[{ element: <EventViewPage />, path: Path.admin.viewEvent() }]}
                />
              </Suspense>
            </ConfirmProvider>
          </SnackbarProvider>
        </TestProvider>
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('tab', { name: 'ALO' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-view-page-structure')
})
