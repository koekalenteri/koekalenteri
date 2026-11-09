import type { Language } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { commands, page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates, eventWithStaticDatesAndClass } from '@/__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesAndClass } from '@/__mockData__/registrations'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { TestProvider } from '@/test-utils/AtomProvider'
import { describeInLanguage } from '@/test-utils/language'
import { EntryInfo } from './EntryInfo'

// The own classes' test clicks the class list; the mouse stays there and would hover the next test's field.
afterEach(() => commands.resetMouse())

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

// KOE-674: an event's own classes are offered by their names, in the reader's language.
const ownClassEvent = {
  ...eventWithStaticDatesAndClass,
  classes: [
    ...eventWithStaticDatesAndClass.classes.map((eventClass) => ({ ...eventClass, class: 'DERBY' })),
    ...eventWithStaticDatesAndClass.classes.map((eventClass) => ({ ...eventClass, class: 'VET10' })),
  ],
  eventType: 'WT-harjoitus',
  ownClasses: [
    { code: 'DERBY', name: { en: 'Derby class', fi: 'Derby-luokka' } },
    { code: 'VET10', name: { en: 'Veterans', fi: 'Veteraanit' } },
  ],
}

const renderOwnClasses = (frame: Omit<FrameProps, 'children'> = {}) =>
  render(
    <TestProvider>
      <Frame {...frame}>
        <EntryInfo
          reg={{ ...registrationWithStaticDatesAndClass, class: 'DERBY', eventType: 'WT-harjoitus' }}
          event={ownClassEvent}
          errorStates={{}}
          helperTexts={{}}
          open
        />
      </Frame>
    </TestProvider>
  )

it("offers an event's own classes by their names", async () => {
  await page.viewport(1200, 900)
  const screen = await renderOwnClasses()

  await screen.getByRole('combobox', { name: 'Koeluokka' }).click()
  await expect.element(screen.getByRole('option', { name: 'Veteraanit' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-info-own-classes')
})

// The guide's English page shows the section in English (KOE-1437).
describeInLanguage('en', () => {
  it('adds the class picker once the event has classes', async () => {
    await page.viewport(1200, 900)

    const screen = await renderWithClasses({ language: 'en' })

    await expect.element(screen.getByRole('combobox', { name: 'Event class' })).toHaveValue('ALO')
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-info-with-classes-en')
  })

  it("offers an event's own classes by their names", async () => {
    await page.viewport(1200, 900)
    const screen = await renderOwnClasses({ language: 'en' })

    await screen.getByRole('combobox', { name: 'Event class' }).click()
    await expect.element(screen.getByRole('option', { name: 'Veterans' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-info-own-classes-en')
  })
})
