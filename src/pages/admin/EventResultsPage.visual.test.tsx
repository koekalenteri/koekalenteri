import type { ConfirmedEvent } from '../../types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStations, registrationsToEventWithStations } from '../../__mockData__/resultsEvent'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { TestProvider } from '../../test-utils/AtomProvider'
import { freezeClockAt } from '../../test-utils/freezeClock'
import { describeInLanguage } from '../../test-utils/language'
import { DataMemoryRouter } from '../../test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import EventResultsPage from './EventResultsPage'
import { adminEventRegistrationsAtom, adminEventsAtom } from './state'

// The trial is long past; a day of its own keeps what the page says about it from moving (KOE-1423).
freezeClockAt('2026-09-07')

// The page renders inside a real WebSocketProvider in production; give it a no-op subscription.
vi.mock(import('../../hooks/useEventSubscription'), () => ({
  useEventSubscription: () => ({ viewers: [] }),
}))

const event: ConfirmedEvent = { ...eventWithStations, location: 'Vaasa', names: { en: 'Results trial' } }
const registrations = registrationsToEventWithStations.map((registration) => ({ ...registration, eventId: event.id }))

// A secretary browsing in English reads the trial's English name in the line that says which trial
// the results are entered against (KOE-1453). The capture stops below the header: the table under it
// has a test of its own.
describeInLanguage('en', () => {
  it("heads the results with the trial's English name", async () => {
    await page.viewport(1000, 600)

    const screen = await render(
      <div data-testid="visual-root" style={{ background: '#fff', height: 88, overflow: 'hidden', width: 1000 }}>
        <ThemeProvider theme={theme}>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.en}>
            <TestProvider
              initializeState={({ set }) => {
                set(adminEventsAtom, [event])
                set(adminEventRegistrationsAtom(event.id), registrations)
              }}
            >
              <AppSnackbarProvider>
                <Suspense fallback={<div>loading...</div>}>
                  <DataMemoryRouter
                    initialEntries={[Path.admin.results(event.id)]}
                    routes={[{ element: <EventResultsPage />, path: Path.admin.results() }]}
                  />
                </Suspense>
              </AppSnackbarProvider>
            </TestProvider>
          </LocalizationProvider>
        </ThemeProvider>
      </div>
    )

    await expect.element(screen.getByText(/Vaasa \(Results trial\)$/)).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-results-page-header-en')
  })
})
