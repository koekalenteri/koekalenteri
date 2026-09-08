import type { DeepPartial, Registration } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { SnackbarProvider } from 'notistack'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { TestProvider } from '@/test-utils/AtomProvider'
import { DogInfo } from './DogInfo'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children, width = 900 }: { readonly children: React.ReactNode; readonly width?: number }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width }}>
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  </div>
)

const registration: DeepPartial<Registration> = {
  dog: {
    breedCode: '110',
    dam: { name: 'Dam Name', titles: 'Dam titles' },
    dob: new Date('2024-05-01'),
    gender: 'M',
    name: 'Dog Name 10',
    refreshDate: new Date('2026-06-01'),
    regNo: 'FI13775/22',
    rfid: '1234567890123456',
    sire: { name: 'Sire Name', titles: 'Sire titles' },
    titles: 'Dog titles',
  },
}

it('shows the fetched dog with its titles, parents and RFID locked as facts', async () => {
  const screen = await render(
    <TestProvider>
      <Frame>
        <DogInfo reg={registration} eventDate={new Date('2026-06-06')} minDogAgeMonths={9} orgId="org" open />
      </Frame>
    </TestProvider>
  )

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

  const screen = await render(
    <TestProvider>
      <Frame width={392}>
        <DogInfo reg={registration} eventDate={new Date('2026-06-06')} minDogAgeMonths={9} orgId="org" open />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByLabelText('Rekisterinumero')).toHaveValue('FI13775/22')
  // The refresh helper text interpolates its relative date a render after the rest of the form
  // paints; waiting for the actual number (not just "sitten.") keeps the capture from catching
  // the raw, unresolved "{{date, distance}} sitten." template.
  await expect.element(screen.getByText(/\d+ \S+ sitten\.$/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('dog-info-fetched-phone')
})
