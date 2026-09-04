import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { render } from 'vitest-browser-react'
import theme from '../../../assets/Theme'
import { StartDaySelector } from '../components/StartDaySelector'
import { StartNumbersTable } from './StartNumbersTable'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children, width = 760 }: { readonly children: React.ReactNode; readonly width?: number }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// Pinned: the labels are weekdays and dates, and a moving clock would move the screenshot.
const friday = new TZDate(2026, 8, 4, 'Europe/Helsinki')
const saturday = new TZDate(2026, 8, 5, 'Europe/Helsinki')
const days = [
  { date: friday, key: '2026-09-04' },
  { date: saturday, key: '2026-09-05' },
]

/** The class tabs sit under the day: the day is chosen first and held while its classes are worked
 *  through (KOE-1350), and the capture is what says so. */
const ClassTabs = () => (
  <Tabs value="ALO">
    <Tab label="ALO" value="ALO" />
    <Tab label="AVO" value="AVO" />
  </Tabs>
)

// Saturday's draw, picked out of a two-day class (KOE-1303): Friday's dogs took 1–24, so these carry on
// from 25 and the list shows only the day being entered.
const saturdayRows = [
  {
    dog: { name: 'Neljas', regNo: 'REG-run-4' },
    groupNumber: 25,
    handler: { name: 'Minsu Rauramo' },
    id: 'run-4',
    placement: { date: saturday, time: 'ap' as const },
    startNumber: 25,
  },
  {
    dog: { name: 'Viides', regNo: 'REG-run-5' },
    groupNumber: 26,
    handler: { name: 'Sari Alho' },
    id: 'run-5',
    placement: { date: saturday, time: 'ap' as const },
  },
  {
    dog: { name: 'Kuudes', regNo: 'REG-run-6' },
    groupNumber: 27,
    handler: { name: 'Inka Heller' },
    id: 'run-6',
    placement: { date: saturday, time: 'ip' as const },
  },
]

it('enters a two-day class one day at a time', async () => {
  const screen = await render(
    <Frame>
      <StartDaySelector days={days} onChange={() => {}} value="2026-09-05" />
      <ClassTabs />
      <div style={{ paddingTop: 16 }}>
        <StartNumbersTable drafts={{ 'run-5': '26' }} onChange={() => {}} rows={saturdayRows} />
      </div>
    </Frame>
  )

  await expect.element(screen.getByText('la 5.9.', { exact: true })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-entry-two-days')
})

// The same choice on a phone (KOE-1282): the day buttons stay, the dog's details fold under its name.
it('keeps the day choice on a phone', async () => {
  const screen = await render(
    <Frame width={360}>
      <StartDaySelector days={days} onChange={() => {}} value="2026-09-05" />
      <ClassTabs />
      <div style={{ paddingTop: 16 }}>
        <StartNumbersTable compact drafts={{ 'run-5': '26' }} onChange={() => {}} rows={saturdayRows} />
      </div>
    </Frame>
  )

  await expect.element(screen.getByText('la 5.9.', { exact: true })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-entry-two-days-phone')
})
