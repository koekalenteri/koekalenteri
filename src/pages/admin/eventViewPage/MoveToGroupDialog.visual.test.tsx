import type { Registration, RegistrationGroup } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { parseISO } from 'date-fns'
import { render } from 'vitest-browser-react'
import { eventWithStaticDatesAnd3Classes } from '../../../__mockData__/events'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import theme from '../../../assets/Theme'
import MoveToGroupDialog from './MoveToGroupDialog'

const noop = async () => undefined

const saturday = parseISO('2026-09-19T09:00:00Z')
const sunday = parseISO('2026-09-20T09:00:00Z')

// The days a secretary chooses between when raising a dog off the reserve list (KOE-289). The dog
// is entered for both mornings but not the Sunday afternoon, which the dialog offers greyed out.
const groups: RegistrationGroup[] = [
  { date: saturday, key: '2026-09-19-ap', number: 1, time: 'ap' },
  { date: sunday, key: '2026-09-20-ap', number: 2, time: 'ap' },
  { date: sunday, key: '2026-09-20-ip', number: 3, time: 'ip' },
]

const reserveDog: Registration = {
  ...registrationWithStaticDates,
  dates: [
    { date: saturday, time: 'ap' },
    { date: sunday, time: 'ap' },
  ],
  dog: { ...registrationWithStaticDates.dog, name: 'STENHØJGÅRDS MOSES' },
  group: { key: 'reserve', number: 1 },
}

it('offers the days the reserve dog is entered for', async () => {
  const screen = await render(
    <ThemeProvider theme={theme}>
      <MoveToGroupDialog
        open
        onClose={() => {}}
        registration={reserveDog}
        event={eventWithStaticDatesAnd3Classes}
        groups={groups}
        onMove={noop}
      />
    </ThemeProvider>
  )

  // The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
  await expect(screen.getByRole('dialog')).toMatchScreenshot('move-to-group-days')
})
