import type { Registration } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { parseISO } from 'date-fns'
import { render } from 'vitest-browser-react'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import theme from '../../../assets/Theme'
import MoveToPositionDialog from './MoveToPositionDialog'

const noop = async () => {}

// A reserve dog entered for both days of a class whose Saturday draw has begun (KOE-1273): the day
// is named before the number, and the numbers on offer are that day's free ones.
const reserveDog: Registration = {
  ...registrationWithStaticDates,
  dog: { ...registrationWithStaticDates.dog, name: 'STENHØJGÅRDS MOSES' },
  group: { key: 'reserve', number: 1 },
}
const days = [
  { date: parseISO('2026-09-19T09:00:00Z'), key: '2026-09-19-ap', time: 'ap' as const },
  { date: parseISO('2026-09-20T09:00:00Z'), key: '2026-09-20-ap', time: 'ap' as const },
]

it('names the day before the number for a reserve dog on a drawn day', async () => {
  const screen = await render(
    <ThemeProvider theme={theme}>
      <MoveToPositionDialog
        open
        onClose={() => {}}
        registration={reserveDog}
        positions={[2, 5]}
        assignNumber
        days={days}
        selectedDay="2026-09-19-ap"
        onSelectDay={() => {}}
        onMove={noop}
      />
    </ThemeProvider>
  )

  // The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
  await expect(screen.getByRole('dialog')).toMatchScreenshot('move-to-position-day')
})
