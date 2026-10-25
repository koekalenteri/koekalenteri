import type { RouteObject } from 'react-router'
import type { Registration } from '../types'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../__mockData__/events'
import { withPaymentPicture } from '../__mockData__/paymentPicture'
import { registrationWithStaticDates, unpaidRegistrationWithStaticDates } from '../__mockData__/registrations'
import theme from '../assets/Theme'
import { locales } from '../i18n'
// The back link's black/bold/underlined look is a global class, not a theme override.
import '../index.css'
import { Path } from '../routeConfig'
import { TestProvider } from '../test-utils/AtomProvider'
import { freezeClockAt, frozenInstant } from '../test-utils/freezeClock'
import { DataMemoryRouter } from '../test-utils/utils'
import AppSnackbarProvider from './components/AppSnackbarProvider'
import { RegistrationListPage } from './RegistrationListPage'

// The fixtures carry absolute dates; what the page offers depends on where today falls (KOE-1423).
const frozen = freezeClockAt('2026-09-07')

// The entry the page reads; a test may answer with another one.
const served = vi.hoisted(() => ({ registration: undefined as Registration | undefined }))

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
  getRegistration: async () =>
    withPaymentPicture(eventWithStaticDates, served.registration ?? registrationWithStaticDates),
}))

afterEach(() => {
  sessionStorage.clear()
  served.registration = undefined
  vi.setSystemTime(frozen)
})

const renderPage = async (path: string) => {
  const routes: RouteObject[] = [{ element: <RegistrationListPage />, path: '/r/:id/:registrationId' }]
  await page.viewport(1000, 900)

  return render(
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
}

it('titles the page with the entry list and its sections one level below', async () => {
  const screen = await renderPage(Path.registration(registrationWithStaticDates))

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

// KOE-1589: the trial ended 11.2.2021. Through the 7th day after it the fee can still be paid, from the
// status box and the row.
it('offers paying an unpaid fee in the week after the trial', async () => {
  vi.setSystemTime(frozenInstant('2021-02-15'))
  served.registration = unpaidRegistrationWithStaticDates

  const screen = await renderPage(Path.registration(unpaidRegistrationWithStaticDates))

  await expect.element(screen.getByRole('button', { exact: true, name: 'MAKSA' })).toBeEnabled()
  await expect.element(screen.getByRole('button', { name: 'Maksa ilmoittautuminen' })).toBeEnabled()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('registration-list-page-payment-window')
})
