import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { registrationWithManualResults, registrationWithStaticDatesAndClass } from '@/__mockData__/registrations'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { getRequirements } from '@/rules'
import QualifyingResultsInfo from './QualifyingResultsInfo'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children, width = 1000 }: { readonly children: React.ReactNode; readonly width?: number }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width }}>
    <ThemeProvider theme={theme}>
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
