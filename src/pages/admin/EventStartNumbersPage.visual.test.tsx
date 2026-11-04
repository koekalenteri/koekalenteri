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
import { DataMemoryRouter } from '../../test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import EventStartNumbersPage from './EventStartNumbersPage'
import { adminEventRegistrationsAtom, adminEventsAtom } from './state'

// The trial is long past; a day of its own keeps what the page says about it from moving (KOE-1423).
freezeClockAt('2026-09-07')

const event = { ...eventWithStations, location: 'Vaasa' }
const registrations = registrationsToEventWithStations.map((registration) => ({ ...registration, eventId: event.id }))

// The head says which trial the numbers go to; the capture stops below it, the sheet is another matter (KOE-1699).
it('heads the numbers with the way back and the trial', async () => {
  await page.viewport(1000, 600)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', height: 130, overflow: 'hidden', width: 1000 }}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <TestProvider
            initializeState={({ set }) => {
              set(adminEventsAtom, [event])
              set(adminEventRegistrationsAtom(event.id), registrations)
            }}
          >
            <AppSnackbarProvider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter
                  initialEntries={[Path.admin.startNumbers(event.id)]}
                  routes={[{ element: <EventStartNumbersPage />, path: Path.admin.startNumbers() }]}
                />
              </Suspense>
            </AppSnackbarProvider>
          </TestProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('link', { name: 'Takaisin tapahtumaan' })).toBeVisible()
  await expect.element(screen.getByText(/Vaasa Tuloskoe$/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-start-numbers-page-header')
})
