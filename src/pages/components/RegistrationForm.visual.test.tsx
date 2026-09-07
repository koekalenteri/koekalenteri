import { createTheme, ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../../__mockData__/events'
import { registrationWithStaticDates } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { TestProvider } from '../../test-utils/AtomProvider'
import RegistrationForm from './RegistrationForm'

// The Handler/Payer sections slide open or shut behind a Collapse whose auto height is measured
// from real content; a capture mid-slide freezes the page with a huge blank reserved gap where
// the collapsing section used to be (the same issue EventForm's own phone/desktop tests avoid).
const stillTheme = createTheme(theme, { transitions: { getAutoHeightDuration: () => 0 } })

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children, width = 1000 }: { readonly children: React.ReactNode; readonly width?: number }) => (
  <div data-testid="visual-root" style={{ background: '#fff', width }}>
    <ThemeProvider theme={stillTheme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <Suspense fallback={<div>loading...</div>}>
          <SnackbarProvider>{children}</SnackbarProvider>
        </Suspense>
      </LocalizationProvider>
    </ThemeProvider>
  </div>
)

it('shows every section open, in order, down to the submit bar', async () => {
  // Chromium only paints what has scrolled into the viewport at least once; a viewport shorter
  // than the whole form leaves everything below the fold blank in the capture even though it is
  // correctly laid out. The viewport has to be as tall as the content, the same as EventForm's own
  // desktop/phone tests already size theirs.
  await page.viewport(1000, 2200)

  const screen = await render(
    <TestProvider>
      <Frame>
        <RegistrationForm event={eventWithStaticDates} registration={registrationWithStaticDates} />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByRole('button', { name: 'Tallenna muutokset' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('registration-form-desktop')
})

it('stacks the same sections on a phone', async () => {
  // The submit bar's layout and some sections' fields key off the real browser viewport (MUI Grid
  // v2 media queries, not a container query) -- see DogInfo/EntryInfo/QualifyingResultsInfo (KOE-1318).
  // The viewport also has to be tall enough for the whole (taller, single-column) form to have
  // scrolled into view at least once, or the capture is blank below the fold.
  await page.viewport(392, 2900)

  const screen = await render(
    <TestProvider>
      <Frame width={392}>
        <RegistrationForm event={eventWithStaticDates} registration={registrationWithStaticDates} />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByRole('button', { name: 'Tallenna muutokset' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('registration-form-phone')
})
