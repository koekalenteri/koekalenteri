import { createTheme, ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { registrationWithManualResults, registrationWithStaticDatesAndClass } from '@/__mockData__/registrations'
import theme from '@/assets/Theme'
import { locales, muiLocales } from '@/i18n'
import { getRequirements } from '@/rules'
import { freezeClockAt } from '@/test-utils/freezeClock'
import QualifyingResultsInfo from './QualifyingResultsInfo'

/** The app's theme in Finnish, as App.tsx gives it: MUI's own texts (the date picker's) are Finnish too. */
const finnishTheme = createTheme(theme, muiLocales.fi)

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children, width = 1000 }: { readonly children: React.ReactNode; readonly width?: number }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width }}>
    <ThemeProvider theme={finnishTheme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  </div>
)

it('shows the official result the registry counted towards qualification', async () => {
  const reg = registrationWithStaticDatesAndClass
  const requirements = getRequirements(reg.eventType, reg.class, reg.dates?.length ? reg.dates[0].date : new Date())

  const screen = await render(
    <Frame>
      <QualifyingResultsInfo
        regNo={reg.dog.regNo}
        requirements={requirements}
        results={reg.results}
        qualifyingResults={reg.qualifyingResults}
        open
      />
    </Frame>
  )

  await expect.element(screen.getByRole('textbox', { name: 'Tuomari' })).toHaveValue('test judge')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('qualifying-results-info-official')
})

it('lists manually entered results alongside the official one, each editable', async () => {
  const reg = registrationWithManualResults
  const requirements = getRequirements(reg.eventType, reg.class, reg.dates?.length ? reg.dates[0].date : new Date())

  const screen = await render(
    <Frame>
      <QualifyingResultsInfo
        regNo={reg.dog.regNo}
        requirements={requirements}
        results={reg.results}
        qualifyingResults={reg.qualifyingResults}
        open
      />
    </Frame>
  )

  await expect.element(screen.getByRole('textbox', { name: 'Tuomari' }).nth(1)).toHaveValue('Manual Judge')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('qualifying-results-info-manual')
})

it('stacks each result row in a single column on a phone', async () => {
  const reg = registrationWithManualResults
  const requirements = getRequirements(reg.eventType, reg.class, reg.dates?.length ? reg.dates[0].date : new Date())

  // The section's Grid sizes its columns off the real browser viewport (MUI Grid v2 media
  // queries, not a container query), so a narrow wrapper div alone never triggers its phone
  // layout -- the viewport itself has to shrink, same as EventForm's and ResultsTable's phone tests.
  await page.viewport(392, 900)

  const screen = await render(
    <Frame width={392}>
      <QualifyingResultsInfo
        regNo={reg.dog.regNo}
        requirements={requirements}
        results={reg.results}
        qualifyingResults={reg.qualifyingResults}
        open
      />
    </Frame>
  )

  await expect.element(screen.getByRole('textbox', { name: 'Tuomari' }).nth(1)).toHaveValue('Manual Judge')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('qualifying-results-info-manual-phone')
})

// On a phone a result's date opens MUI's mobile picker, whose toolbar sets the chosen date in the
// theme's h4. The theme's h4 is a heading level of the app's outline now (KOE-1506), so the toolbar
// keeps MUI's own h4 through an override instead of shrinking with it.
describe('the date picker on a phone', () => {
  // The picker offers the days from nine months after the dog's birth up to today, so the dog's birth
  // date goes in as the registration form passes it, and a day of its own keeps today still (KOE-1423).
  freezeClockAt('2026-09-07')

  it("opens a result's date picker on a phone with the chosen date at its full size", async () => {
    const reg = registrationWithManualResults
    const requirements = getRequirements(reg.eventType, reg.class, reg.dates?.length ? reg.dates[0].date : new Date())

    await page.viewport(392, 900)

    const screen = await render(
      <Frame width={392}>
        <QualifyingResultsInfo
          dob={reg.dog.dob}
          regNo={reg.dog.regNo}
          requirements={requirements}
          results={reg.results}
          qualifyingResults={reg.qualifyingResults}
          open
        />
      </Frame>
    )

    await screen
      .getByRole('button', { name: /^Valitse päivä/ })
      .nth(1)
      .click()

    const dialog = screen.getByRole('dialog')
    await expect.element(dialog.getByRole('gridcell', { selected: true })).toBeVisible()
    await expect(dialog).toMatchScreenshot('qualifying-results-info-date-picker-phone')
  })
})
