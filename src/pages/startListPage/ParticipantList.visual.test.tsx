import type { DayKey } from '../../types/Day'
import type { PublicConfirmedEvent } from '../../types/Event'
import type { PublicRegistration } from '../../types/Registration'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { startOfFinnishDay } from '../../test-utils/finnishDays'
import { describeInLanguage } from '../../test-utils/language'
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

// A NOWT whose classes start at different posts (KOE-1665): each class's line says where its group
// starts and in which order it goes round, the class of two number ranges a line per range.
const nowt: PublicConfirmedEvent = {
  ...event,
  classes: [
    { class: 'ALO', date: EVENT_DAY },
    { class: 'AVO', date: EVENT_DAY },
  ],
  eventType: 'NOWT',
  id: 'event-nowt',
  name: 'NOWT Akaa',
  rotations: [
    { class: 'ALO', posts: [{ stationId: 'r1' }, { stationId: 'r2' }, { stationId: 'r3', taskCount: 2 }] },
    {
      class: 'AVO',
      firstNumber: 1,
      lastNumber: 8,
      posts: [{ stationId: 'r3' }, { stationId: 'r1' }, { stationId: 'r2', taskCount: 2 }],
    },
    {
      class: 'AVO',
      firstNumber: 9,
      lastNumber: 16,
      posts: [{ stationId: 'r2' }, { stationId: 'r3' }, { stationId: 'r1', taskCount: 2 }],
    },
  ],
  startNumbersPublished: true,
  stations: [1, 2, 3].map((number) => ({ date: EVENT_DAY, id: `r${number}`, number })),
}

const runner = (eventClass: 'ALO' | 'AVO', name: string, regNo: string, number: number): PublicRegistration => ({
  ...registration(name, regNo),
  class: eventClass,
  group: { date: EVENT_DAY, key: `${eventClass}-ap`, number, time: 'ap' },
})

const runners = [
  runner('ALO', 'WATERFOWLER OAKLEAF', 'FI10724/23', 1),
  runner('AVO', 'WATERFOWLER ODIN', 'FI10716/23', 2),
  runner('AVO', 'WATERFOWLER ONNI', 'FI10718/23', 10),
]

it('tells each group where it starts and in which order it goes round the posts (KOE-1665)', async () => {
  const screen = await render(
    <Frame>
      <ParticipantList event={nowt} participants={runners} />
    </Frame>
  )

  await expect.element(screen.getByText(/^ALO: aloittaa rastilta 1/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-rotation')
})

describeInLanguage('en', () => {
  it('tells each group where it starts and in which order it goes round the posts (KOE-1665)', async () => {
    const screen = await render(
      <Frame>
        <ParticipantList event={nowt} participants={runners} />
      </Frame>
    )

    await expect.element(screen.getByText(/^ALO: starts at station 1/)).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-rotation-en')
  })
})
