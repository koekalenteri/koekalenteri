import type { RouteObject } from 'react-router'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../__mockData__/events'
import theme from '../assets/Theme'
import { locales } from '../i18n'
// The back link's black/bold/underlined look is a global class, not a theme override.
import '../index.css'
import { Path } from '../routeConfig'
import { TestProvider } from '../test-utils/AtomProvider'
import { freezeClockAt } from '../test-utils/freezeClock'
import { DataMemoryRouter } from '../test-utils/utils'
import AppSnackbarProvider from './components/AppSnackbarProvider'
import { Component as RegistrationCreatePage } from './RegistrationCreatePage'

// The fixture's entry runs 1.2.-7.2.2021; the page refuses an entry that is not open on today.
freezeClockAt('2021-02-03')

vi.mock(import('../api/event'), async (importOriginal) => ({
  ...(await importOriginal()),
  getEvent: async () => eventWithStaticDates,
  getEvents: async () => ({ events: [eventWithStaticDates], unchangedIds: [] }),
}))

/** A heading's level, from `aria-level` on a role="heading" element or from the tag of an h1-h6. */
const headingLevel = (element: Element) => Number(element.getAttribute('aria-level') ?? element.tagName.slice(1))

// The new registration is kept in session storage.
afterEach(() => sessionStorage.clear())

it('names the page for a screen reader above the trial heading (KOE-1519)', async () => {
  const routes: RouteObject[] = [{ element: <RegistrationCreatePage />, path: '/event/:eventType/:id' }]
  await page.viewport(1000, 2400)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 1000 }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <TestProvider>
            <AppSnackbarProvider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter initialEntries={[Path.register(eventWithStaticDates)]} routes={routes} />
              </Suspense>
            </AppSnackbarProvider>
          </TestProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </div>
  )

  // The page's name is the h1, read and not seen; the trial stays the visible level 2.
  await expect.element(screen.getByRole('heading', { level: 1, name: 'Ilmoittaudu tapahtumaan' })).toBeInTheDocument()
  await expect.element(screen.getByRole('heading', { level: 2, name: /test location/ })).toBeVisible()
  // In document order: the page, the trial, and the form's "why can't I proceed" section.
  expect(screen.getByRole('heading').elements().map(headingLevel)).toEqual([1, 2, 3])
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('registration-create-page')
})
