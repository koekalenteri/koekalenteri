import type { PartialEvent } from './types'
import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { TIME_ZONE } from '@/lib/day'
import { idTokenAtom } from '@/pages/state'
import { TestProvider } from '@/test-utils/AtomProvider'
import KcIdSection from './KcIdSection'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 700 }}>
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  </div>
)

const event: PartialEvent = {
  classes: [{ class: 'ALO', date: new TZDate('2026-09-26', TIME_ZONE) }],
  endDate: new TZDate('2026-09-27', TIME_ZONE),
  eventType: 'NOU',
  id: 'test',
  judges: [{ id: 1000001, name: 'Testi Tuomari' }],
  location: 'Laukaa',
  organizer: { id: 'org1', name: 'Keski-Suomen Noutajakoirayhdistys' },
  startDate: new TZDate('2026-09-26', TIME_ZONE),
}

const renderSection = (props: Partial<PartialEvent>) =>
  render(
    <TestProvider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
      <Frame>
        <KcIdSection event={{ ...event, ...props }} onChange={() => undefined} open />
      </Frame>
    </TestProvider>
  )

it('says the event is linked to a Kennelliitto trial, and warns where the trial differs (KOE-1534)', async () => {
  const screen = await renderSection({
    kcEvent: {
      classes: ['ALO'],
      endDate: new TZDate('2026-09-27', TIME_ZONE),
      eventType: 'NOU',
      judge: 'Joku Muu',
      judgeId: 4114852,
      location: 'Laukaa',
      startDate: new TZDate('2026-09-26', TIME_ZONE),
    },
    kcGuid: '2b81e6a1-559b-407c-87c7-b8a9b89b1987',
  })

  await expect.element(screen.getByText('Liitetty Kennelliiton kokeeseen')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('kc-id-section-linked')
})

it('shows the old koetunnus of an event that has no GUID yet, with the lookup beside it (KOE-1534)', async () => {
  const screen = await renderSection({ kcId: 451859 })

  await expect.element(screen.getByText(/Vanha koetunnus 451859/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('kc-id-section-legacy')
})
