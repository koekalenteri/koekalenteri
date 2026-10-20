import type { ConfirmedEvent } from '../../types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStations, RESULTS_EVENT_DAY } from '../../__mockData__/resultsEvent'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { addDays } from '../../lib/day'
import { Path } from '../../routeConfig'
import { TestProvider } from '../../test-utils/AtomProvider'
import { freezeClockAt } from '../../test-utils/freezeClock'
import { DataMemoryRouter } from '../../test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import EventStationsPage from './EventStationsPage'
import { adminEventsAtom } from './state'

// The trial is long past; a day of its own keeps what the page says about it from moving (KOE-1423).
freezeClockAt('2026-09-07')

const SECOND_DAY = addDays(RESULTS_EVENT_DAY, 1)

// A course is built per day, and over two days each day's posts sit under the day as a heading of
// their own, one level below the page's title (KOE-1506).
const event: ConfirmedEvent = {
  ...eventWithStations,
  classes: [
    { class: 'ALO', date: RESULTS_EVENT_DAY },
    { class: 'AVO', date: SECOND_DAY },
  ],
  endDate: SECOND_DAY,
  stations: [
    ...eventWithStations.stations,
    { date: SECOND_DAY, id: 'post-3', judges: [{ id: 223, name: 'Tuomari 2' }], number: 1, tasks: 2 },
  ],
}

it("lays out the course under each of the trial's days", async () => {
  await page.viewport(1000, 900)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 1000 }}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <TestProvider initializeState={({ set }) => set(adminEventsAtom, [event])}>
            <AppSnackbarProvider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter
                  initialEntries={[Path.admin.stations(event.id)]}
                  routes={[{ element: <EventStationsPage />, path: Path.admin.stations() }]}
                />
              </Suspense>
            </AppSnackbarProvider>
          </TestProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('heading', { level: 1 })).toBeVisible()
  await expect.element(screen.getByRole('heading', { level: 2 }).nth(1)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-stations-page-two-days')
})
