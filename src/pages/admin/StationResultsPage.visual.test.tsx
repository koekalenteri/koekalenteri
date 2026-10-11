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
import StationResultsPage from './StationResultsPage'
import { adminEventRegistrationsAtom, adminEventsAtom } from './state'

// The trial is long past; a day of its own keeps what the page says about it from moving (KOE-1423).
freezeClockAt('2026-09-07')

// The page renders inside a real WebSocketProvider in production; give it a no-op subscription.
vi.mock(import('../../hooks/useEventSubscription'), () => ({
  useEventSubscription: () => ({ viewers: [] }),
}))

const event: ConfirmedEvent = { ...eventWithStations, location: 'Vaasa', names: { en: 'Results trial' } }
const registrations = registrationsToEventWithStations.map((registration) => ({ ...registration, eventId: event.id }))

// A secretary browsing in English reads the trial's English name under the post's heading, as on the
// results page (KOE-1453). The capture stops below the header: the scoring under it is another matter.
describeInLanguage('en', () => {
  it("heads the post's screen with the trial's English name", async () => {
    await page.viewport(1000, 600)

    const screen = await render(
      <div data-testid="visual-root" style={{ background: '#fff', height: 116, overflow: 'hidden', width: 1000 }}>
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
                    initialEntries={[Path.admin.stationResults(event.id, 'post-2')]}
                    routes={[{ element: <StationResultsPage />, path: Path.admin.stationResults() }]}
                  />
                </Suspense>
              </AppSnackbarProvider>
            </TestProvider>
          </LocalizationProvider>
        </ThemeProvider>
      </div>
    )

    await expect.element(screen.getByText(/^Results trial/)).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('station-results-page-header-en')
  })
})
