import type { RouteObject } from 'react-router'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../__mockData__/events'
import { withPaymentPicture } from '../__mockData__/paymentPicture'
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
import { RegistrationListPage } from './RegistrationListPage'

// The fixtures carry absolute dates; what the page offers depends on where today falls (KOE-1423).
freezeClockAt('2026-09-07')

// The header is the app's, with its own tests; this one is about the page under it.
vi.mock('./components/Header', () => ({ default: () => null }))
// The page follows its registration over the socket; there is no socket here.
vi.mock(import('../hooks/useRegistrationSubscription'), () => ({ useRegistrationSubscription: () => undefined }))
vi.mock(import('../api/event'), async (importOriginal) => ({
  ...(await importOriginal()),
  getEvent: async () => eventWithStaticDates,
  getEvents: async () => ({ events: [eventWithStaticDates], unchangedIds: [] }),
}))
vi.mock(import('../api/registration'), async (importOriginal) => ({
  ...(await importOriginal()),
  getRegistration: async () => withPaymentPicture(eventWithStaticDates, registrationWithStaticDates),
}))

afterEach(() => sessionStorage.clear())

it('titles the page with the entry list and its sections one level below', async () => {
  const path = Path.registration(registrationWithStaticDates)
  const routes: RouteObject[] = [{ element: <RegistrationListPage />, path: '/r/:id/:registrationId' }]
  await page.viewport(1000, 900)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 1000 }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
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

  // "Ilmoittautumistiedot" is the page's h1; the trial, the registered dogs and the payment details
  // are h2s under it (KOE-1506).
  await expect.element(screen.getByRole('heading', { level: 1, name: 'Ilmoittautumistiedot' })).toBeVisible()
  await expect.element(screen.getByRole('heading', { level: 2, name: /test location/ })).toBeVisible()
  await expect.element(screen.getByRole('heading', { level: 2, name: 'Ilmoitetut koirat' })).toBeVisible()
  await expect.element(screen.getByRole('heading', { level: 2, name: 'Maksutiedot' })).toBeVisible()
  expect(screen.getByRole('heading').elements()).toHaveLength(4)
  await expect.element(screen.getByText(registrationWithStaticDates.dog.name ?? '')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('registration-list-page')
})
