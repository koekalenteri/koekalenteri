import type { DayKey } from '../../types/Day'
import type { PublicConfirmedEvent } from '../../types/Event'
import type { PublicRegistration } from '../../types/Registration'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { startOfFinnishDay } from '../../test-utils/finnishDays'
import { ParticipantList } from './ParticipantList'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 900 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const EVENT_DAY: DayKey = '2026-10-02'

// A NOU: no classes, so the withheld-numbers note hangs off the date header (KOE-1006 feedback).
const event: PublicConfirmedEvent = {
  classes: [],
  cost: 0,
  costMember: 0,
  createdAt: startOfFinnishDay(EVENT_DAY),
  description: '',
  endDate: EVENT_DAY,
  entryEndDate: EVENT_DAY,
  entryStartDate: EVENT_DAY,
  eventType: 'NOU',
  id: 'event-nou',
  judges: [],
  location: 'Akaa',
  modifiedAt: startOfFinnishDay(EVENT_DAY),
  name: 'NOU Akaa',
  organizer: { id: 'org-1', name: 'Testiyhdistys' },
  places: 0,
  startDate: EVENT_DAY,
  startListPublished: true,
  startNumbersPublished: false,
  state: 'invited',
}

const registration = (name: string, regNo: string): PublicRegistration => ({
  breeder: 'Inka Heller-Schedel',
  dog: {
    breedCode: '111',
    dam: { name: 'PORTLEDGE PENELOPE' },
    dob: '2022-12-01',
    gender: 'M',
    name,
    regNo,
    sire: { name: 'ANNALOUGHAN ACE' },
  },
  group: { date: EVENT_DAY, key: 'ap', time: 'ap' },
  handler: 'Minsu Rauramo',
  owner: 'Minsu Rauramo',
  ownerHandles: true,
})

it('notes the unconfirmed start order under the date of a classless event', async () => {
  const screen = await render(
    <Frame>
      <ParticipantList
        event={event}
        participants={[
          registration('WATERFOWLER OAKLEAF', 'FI10724/23'),
          registration('WATERFOWLER ODIN', 'FI10716/23'),
        ]}
      />
    </Frame>
  )

  await expect.element(screen.getByText(/starttij/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-classless-note')
})
