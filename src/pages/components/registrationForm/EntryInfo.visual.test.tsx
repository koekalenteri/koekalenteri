import type { Language } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates, eventWithStaticDatesAndClass } from '@/__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesAndClass } from '@/__mockData__/registrations'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { TestProvider } from '@/test-utils/AtomProvider'
import { describeInLanguage } from '@/test-utils/language'
import { EntryInfo } from './EntryInfo'

interface FrameProps {
  readonly children: React.ReactNode
  readonly language?: Language
  readonly width?: number
}

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children, language = 'fi', width = 900 }: FrameProps) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width }}>
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  </div>
)

/** The section for an event with classes, in the frame given. */
const renderWithClasses = (frame: Omit<FrameProps, 'children'> = {}) =>
  render(
    <TestProvider>
      <Frame {...frame}>
        <EntryInfo
          reg={registrationWithStaticDatesAndClass}
          event={eventWithStaticDatesAndClass}
          errorStates={{}}
          helperTexts={{}}
          open
        />
      </Frame>
    </TestProvider>
  )

it('offers only the reserve choice and the day/group pickers when the event has no classes', async () => {
  const screen = await render(
    <TestProvider>
      <Frame>
        <EntryInfo
          reg={registrationWithStaticDates}
          event={eventWithStaticDates}
          errorStates={{}}
          helperTexts={{}}
          open
        />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByLabelText('Pystyn ottamaan koepaikan vastaan varasijalta')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-info-no-classes')
})

it('adds the class picker once the event has classes', async () => {
  const screen = await renderWithClasses()

  await expect.element(screen.getByRole('combobox', { name: 'Koeluokka' })).toHaveValue('ALO')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-info-with-classes')
})

it('stacks the fields in a single column on a phone', async () => {
  // The section's Grid sizes its columns off the real browser viewport (MUI Grid v2 media
  // queries, not a container query), so a narrow wrapper div alone never triggers its phone
  // layout -- the viewport itself has to shrink, same as EventForm's and ResultsTable's phone tests.
  await page.viewport(392, 900)

  const screen = await renderWithClasses({ width: 392 })

  await expect.element(screen.getByRole('combobox', { name: 'Koeluokka' })).toHaveValue('ALO')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-info-with-classes-phone')
})

// The guide's English page shows the section in English (KOE-1437).
describeInLanguage('en', () => {
  it('adds the class picker once the event has classes', async () => {
    await page.viewport(1200, 900)

    const screen = await renderWithClasses({ language: 'en' })

    await expect.element(screen.getByRole('combobox', { name: 'Event class' })).toHaveValue('ALO')
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-info-with-classes-en')
  })
})
