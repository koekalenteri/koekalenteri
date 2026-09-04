import type { EntryEvent } from './types'
import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render } from 'vitest-browser-react'
import theme from '../../../../assets/Theme'
import { locales } from '../../../../i18n'
import { TIME_ZONE } from '../../../../i18n/dates'
import EntrySection from './EntrySection'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 1000 }}>
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  </div>
)

const day = new TZDate('2026-06-06', TIME_ZONE)

// Pinned dates: the section renders the entry period and the trial dates, so nothing may follow the clock.
const event: EntryEvent = {
  classes: [{ class: 'AVO', date: day, places: 12 }],
  createdAt: new TZDate('2026-03-01', TIME_ZONE),
  endDate: day,
  entryEndDate: new TZDate('2026-05-17', TIME_ZONE),
  entryStartDate: new TZDate('2026-04-25', TIME_ZONE),
  eventType: 'NOME-B',
  places: 12,
  priority: ['member'],
  restrictions: ['member', '111', '122'],
  startDate: day,
}

it('shows the entry restrictions as chips below the priorities (KOE-524)', async () => {
  const screen = await render(
    <Frame>
      <EntrySection event={event} eventTypeClasses={['ALO', 'AVO', 'VOI']} open />
    </Frame>
  )

  await expect.element(screen.getByRole('combobox', { name: 'Rajoitukset' })).toBeVisible()
  await expect.element(screen.getByText('labradorinnoutaja')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-section-restrictions')
})
