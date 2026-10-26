import type { ConfirmedEvent, DayKey, Registration } from '../../types'
import { ThemeProvider } from '@mui/material/styles'
import { ConfirmProvider } from 'material-ui-confirm'
import { Suspense } from 'react'
import { render } from 'vitest-browser-react'
import { emptyEvent } from '../../__mockData__/emptyEvent'
import { registrationWithStaticDates } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import { Path } from '../../routeConfig'
import { TestProvider } from '../../test-utils/AtomProvider'
import { freezeClockAt } from '../../test-utils/freezeClock'
import { DataMemoryRouter, TEST_ID_TOKEN } from '../../test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import { idTokenAtom } from '../state'
import EventViewPage from './EventViewPage'
import { adminEventRegistrationsAtom, adminEventsAtom, adminEventTypesAtom } from './state'

// The fixtures below carry absolute dates, and what the view says about them depends on where
// today falls; the day the baselines were taken is the day this file keeps (KOE-1423).
freezeClockAt('2026-09-07')

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

const day = (iso: DayKey): DayKey => iso
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

/** The page for one event and its entries. */
const renderPage = (shown: ConfirmedEvent, entries: Registration[]) =>
  render(
    // A fixed height with overflow hidden crops the capture to the page's own structure -- the
    // entry grid underneath already has its own coverage from KOE-1322.
    <div data-testid="visual-root" style={{ background: '#fff', height: 230, overflow: 'hidden', width: 1200 }}>
      <ThemeProvider theme={theme}>
        <TestProvider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventsAtom, [shown])
            set(adminEventRegistrationsAtom(shown.id), entries)
            // The step list asks the event types whether the format is official; the built-in list answers.
            void set(adminEventTypesAtom, [])
          }}
        >
          <AppSnackbarProvider>
            <ConfirmProvider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter
                  initialEntries={[Path.admin.viewEvent(shown.id)]}
                  routes={[{ element: <EventViewPage />, path: Path.admin.viewEvent() }]}
                />
              </Suspense>
            </ConfirmProvider>
          </AppSnackbarProvider>
        </TestProvider>
      </ThemeProvider>
    </div>
  )

// Every render gets a fresh store, so the entry dialogs at the foot of the page suspend on their
// atoms each time, and until they have loaded the page sits behind its loading modal, which hides
// the tabs from role queries. The 1000 ms that `vi.waitFor` and `expect.element` wait by default is
// not always enough for that on a CI runner.
const loadTimeout = { timeout: 10_000 }

// The first render of the page in a file suspends on the event atom, a promise until the list has
// loaded and a plain value after, by design (see adminEventAtom), and React 19 notes that it completes
// without it. One render ahead of the tests takes that note, so every test renders alike and none
// depends on running after another.
beforeAll(async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const screen = await renderPage(event, registrations)
  await vi.waitFor(() => screen.getByRole('tab', { name: 'ALO' }).element(), loadTimeout)
  await screen.unmount()
  consoleError.mockRestore()
})

it("shows the event's status row, info panel and class tabs above the entry grid", async () => {
  const screen = await renderPage(event, registrations)

  await expect.element(screen.getByRole('tab', { name: 'ALO' }), loadTimeout).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-view-page-structure')
})

// VOI picked before ALO and on the first of two days: the tabs still read ALO, VOI, and the view opens
// on ALO (KOE-1596).
it('shows the class tabs as ALO, AVO, VOI whatever order the classes were picked in (KOE-1596)', async () => {
  const pickedVoiFirst: ConfirmedEvent = {
    ...event,
    classes: [
      { class: 'VOI', date: start },
      { class: 'ALO', date: end },
    ],
    eventType: 'NOWT',
    id: 'view-event-class-order',
  }
  const screen = await renderPage(pickedVoiFirst, [
    { ...registrations[0], eventId: pickedVoiFirst.id, eventType: 'NOWT' },
    { ...registrations[1], class: 'VOI', eventId: pickedVoiFirst.id, eventType: 'NOWT' },
  ])

  await expect.element(screen.getByRole('tab', { name: 'ALO', selected: true }), loadTimeout).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-view-page-class-order')
})
