import type { DeepPartial, Language, Registration } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { TestProvider } from '@/test-utils/AtomProvider'
import { freezeClockAt } from '@/test-utils/freezeClock'
import { describeInLanguage } from '@/test-utils/language'
import AppSnackbarProvider from '../AppSnackbarProvider'
import { DogInfo } from './DogInfo'

// The fixtures below carry absolute dates, and what the view says about them depends on where
// today falls; the day the baselines were taken is the day this file keeps (KOE-1423).
freezeClockAt('2026-09-07')

// Kennelliitto knows no dog by the number typed below (KOE-1651).
vi.mock(import('@/api/dog'), async (importOriginal) => ({
  ...(await importOriginal()),
  getDog: async () => Promise.reject(Object.assign(new Error('Not found'), { status: 404 })),
}))

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
        <AppSnackbarProvider>{children}</AppSnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  </div>
)

const registration: DeepPartial<Registration> = {
  dog: {
    breedCode: '110',
    dam: { name: 'Dam Name', titles: 'Dam titles' },
    dob: '2024-05-01',
    gender: 'M',
    name: 'Dog Name 10',
    refreshDate: new Date('2026-06-01'),
    regNo: 'FI13775/22',
    rfid: '123456789012345',
    sire: { name: 'Sire Name', titles: 'Sire titles' },
    titles: 'Dog titles',
  },
}

/** The section with the dog fetched from the Kennel Club, in the frame given. */
const renderFetched = (frame: Omit<FrameProps, 'children'> = {}) =>
  render(
    <TestProvider>
      <Frame {...frame}>
        <DogInfo reg={registration} eventDate="2026-06-06" minDogAgeMonths={9} orgId="org" open />
      </Frame>
    </TestProvider>
  )

it('shows the fetched dog with its titles, parents and RFID locked as facts', async () => {
  const screen = await renderFetched()

  await expect.element(screen.getByLabelText('Rekisterinumero')).toHaveValue('FI13775/22')
  // The refresh helper text interpolates its relative date a render after the rest of the form
  // paints; waiting for the actual number (not just "sitten.") keeps the capture from catching
  // the raw, unresolved "{{date, distance}} sitten." template.
  await expect.element(screen.getByText(/\d+ \S+ sitten\.$/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('dog-info-fetched')
})

it('stacks the fields in a single column on a phone', async () => {
  // The section's Grid sizes its columns off the real browser viewport (MUI Grid v2 media
  // queries, not a container query), so a narrow wrapper div alone never triggers its phone
  // layout -- the viewport itself has to shrink, same as EventForm's and ResultsTable's phone tests.
  await page.viewport(392, 900)

  const screen = await renderFetched({ width: 392 })

  await expect.element(screen.getByLabelText('Rekisterinumero')).toHaveValue('FI13775/22')
  // The refresh helper text interpolates its relative date a render after the rest of the form
  // paints; waiting for the actual number (not just "sitten.") keeps the capture from catching
  // the raw, unresolved "{{date, distance}} sitten." template.
  await expect.element(screen.getByText(/\d+ \S+ sitten\.$/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('dog-info-fetched-phone')
})

it('marks a typed microchip that is not 15 digits and says why', async () => {
  // Kennelliitto gave the dog no chip, so it is the registrant's to type; a registration number's
  // digits are not one (KOE-1650).
  await page.viewport(1200, 900)
  const typed: DeepPartial<Registration> = { dog: { ...registration.dog, rfid: '623372020', rfidEditable: true } }
  const screen = await render(
    <TestProvider>
      <Frame>
        <DogInfo reg={typed} eventDate="2026-06-06" minDogAgeMonths={9} orgId="org" open />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByLabelText('Tunnistusmerkintä')).toHaveValue('623372020')
  await expect.element(screen.getByText('Tunnistusmerkinnässä pitää olla 15 numeroa')).toBeVisible()
  await expect.element(screen.getByText(/\d+ \S+ sitten\.$/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('dog-info-microchip-invalid')
})

it('says the form a number not found must take to be entered by hand', async () => {
  // A number Kennelliitto does not know is the registrant's to type, in its registry's form; the
  // button that enters the dog by hand waits for it (KOE-1651). Below the lg breakpoint the number
  // gets half the row, so it shows in full.
  await page.viewport(1000, 900)
  const screen = await render(
    <TestProvider>
      <Frame>
        <DogInfo reg={{}} eventDate="2026-06-06" minDogAgeMonths={9} orgId="org" open />
      </Frame>
    </TestProvider>
  )

  await userEvent.fill(screen.getByLabelText('Rekisterinumero'), 'DK 21568/2021')
  await screen.getByRole('button', { name: 'Hae koiran tiedot' }).click()

  await expect.element(screen.getByText('Tanskalaiset rekisterinumerot ovat muotoa DK12345/2021')).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Syötä tiedot käsin' })).toBeDisabled()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('dog-info-regno-invalid')
})

it('marks the corrected number of a dog entered by hand as it is typed', async () => {
  // A stored dog typed by hand: its number is the registrant's, so a corrected one must be in its
  // registry's form before it can be looked up (KOE-1651).
  await page.viewport(1000, 900)
  const typed: DeepPartial<Registration> = {
    dog: { ...registration.dog, refreshDate: undefined, regNo: 'EST-03101/26' },
  }
  const screen = await render(
    <TestProvider>
      <Frame>
        <DogInfo reg={typed} eventDate="2026-06-06" minDogAgeMonths={9} orgId="org" open />
      </Frame>
    </TestProvider>
  )

  await userEvent.fill(screen.getByLabelText('Rekisterinumero'), 'EST03101/26')

  await expect.element(screen.getByText('Virolaiset rekisterinumerot ovat muotoa EST-12345/20')).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Hae koiran tiedot' })).toBeDisabled()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('dog-info-typed-regno-invalid')
})

// The guide's English page shows the section in English (KOE-1437).
describeInLanguage('en', () => {
  it('shows the fetched dog with its titles, parents and RFID locked as facts', async () => {
    await page.viewport(1200, 900)

    const screen = await renderFetched({ language: 'en' })

    await expect.element(screen.getByLabelText('Registration number')).toHaveValue('FI13775/22')
    await expect.element(screen.getByText(/\d+ \S+ ago\.$/)).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('dog-info-fetched-en')
  })
})
