import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../__mockData__/events'
import { registrationWithStaticDates } from '../__mockData__/registrations'
import theme from '../assets/Theme'
import { locales } from '../i18n'
// The back link's black/bold/underlined look is a global class, not a theme override.
import '../index.css'
import { Path } from '../routeConfig'
import { TestProvider } from '../test-utils/AtomProvider'
import { freezeClockAt } from '../test-utils/freezeClock'
import { DataMemoryRouter } from '../test-utils/utils'
import AppSnackbarProvider from './components/AppSnackbarProvider'
import RegistrationEditPage from './RegistrationEditPage'

// The fixtures carry absolute dates; what the form allows depends on where today falls (KOE-1423).
freezeClockAt('2026-09-07')

// A cancelled registration: the notice that says so stands where a heading would, in a heading's
// size, and is a paragraph (KOE-1506).
const registration = { ...registrationWithStaticDates, cancelled: true }

vi.mock(import('../api/event'), async (importOriginal) => ({
  ...(await importOriginal()),
  getEvent: async () => eventWithStaticDates,
  getEvents: async () => ({ events: [eventWithStaticDates], unchangedIds: [] }),
}))
vi.mock(import('../api/registration'), async (importOriginal) => ({
  ...(await importOriginal()),
  getRegistration: async () => registration,
}))

// The form under edit is kept in session storage.
afterEach(() => sessionStorage.clear())

it('shows a cancelled registration with the notice as text, not a heading', async () => {
  const path = `${Path.registration(registration)}/edit`
  const routes: RouteObject[] = [{ element: <RegistrationEditPage />, path: '/r/:id/:registrationId/edit' }]
  await page.viewport(1000, 2400)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 1000 }}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <TestProvider>
            <AppSnackbarProvider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </Suspense>
            </AppSnackbarProvider>
          </TestProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </div>
  )

  // The trial is the one heading; the cancellation notice under it is not one.
  await expect.element(screen.getByText('Tämä ilmoittautuminen on peruttu')).toBeVisible()
  await expect.element(screen.getByRole('heading', { level: 2, name: /test location/ })).toBeVisible()
  expect(screen.getByRole('heading').elements()).toHaveLength(1)
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('registration-edit-page-cancelled')
})
