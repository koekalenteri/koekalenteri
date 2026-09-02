import type { StationTurnItem } from './StationTurnControls'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../assets/Theme'
import { StationTurnControls } from './StationTurnControls'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 760 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// The group has been out a fixed six minutes and two closed spans give the pace line something to
// say, so nothing in the picture depends on the wall clock beyond the open span's own minutes.
const now = Date.now()
const minutesAgo = (minutes: number) => new Date(now - minutes * 60000)

const closed = (_id: string, from: number, to: number): StationTurnItem => ({
  dogs: [{ name: 'Aiempi ryhma' }],
  endedAt: minutesAgo(to),
  startedAt: minutesAgo(from),
  stationId: 'post-1',
})

const turns: StationTurnItem[] = [
  closed('a', 30, 21),
  closed('b', 21, 14),
  {
    dogs: [
      { mark: 'gotRetrieve', name: 'ANNALOUGHAN ACE', number: 1 },
      { mark: 'noRetrieve', name: 'WATERFOWLER ODIN', number: 2 },
      { mark: 'eyeWipe', name: 'PORTLEDGE PENELOPE', number: 3 },
      { name: 'WATERFOWLER OAKLEAF', number: 4 },
    ],
    startedAt: minutesAgo(6),
    stationId: 'post-1',
  },
]

it("marks the group that is out, in the format's own vocabulary (KOE-1259)", async () => {
  const screen = await render(
    <Frame>
      <StationTurnControls
        dogs={[{ id: 'run-5', name: 'GLENBRIAR GRACE', number: 5 }]}
        eventType="NOME-A"
        onTurn={async () => {}}
        station={{ id: 'post-1', tasks: 1 }}
        turns={turns}
      />
    </Frame>
  )

  await expect.element(screen.getByText('2 WATERFOWLER ODIN · Ei noutoa')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('station-turn-marks')
})

// A taipumuskoe's day in its fixed phases: the briefing done, the first dog's run through the water
// mark and now on the search — one span, two phases — with nothing left to move on to.
it("runs a taipumuskoe's day in phases (KOE-1259)", async () => {
  const day: StationTurnItem[] = [
    {
      dogs: [],
      endedAt: minutesAgo(40),
      phases: [{ key: 'briefing', startedAt: minutesAgo(55) }],
      startedAt: minutesAgo(55),
      stationId: '1',
    },
    {
      dogs: [{ name: 'ANNALOUGHAN ACE', number: 1 }],
      phases: [
        { key: 'waterMark', startedAt: minutesAgo(15) },
        { key: 'search', startedAt: minutesAgo(9) },
      ],
      startedAt: minutesAgo(15),
      stationId: '1',
    },
  ]
  const screen = await render(
    <Frame>
      <StationTurnControls
        dogs={[{ id: 'run-2', name: 'WATERFOWLER ODIN', number: 2 }]}
        eventType="NOU"
        onTurn={async () => {}}
        station={{ id: '1', tasks: 1 }}
        turns={day}
      />
    </Frame>
  )

  await expect.element(screen.getByText('1 ANNALOUGHAN ACE · Haku · 15 min')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('station-turn-phases')
})

// The same day a little earlier: the first dog is at the water mark, so the one thing to do next is
// to move it on to the search — the button says where to.
it('offers the next phase while a run is in one that has a next (KOE-1259)', async () => {
  const day: StationTurnItem[] = [
    {
      dogs: [],
      endedAt: minutesAgo(40),
      phases: [{ key: 'briefing', startedAt: minutesAgo(55) }],
      startedAt: minutesAgo(55),
      stationId: '1',
    },
    {
      dogs: [{ name: 'ANNALOUGHAN ACE', number: 1 }],
      phases: [{ key: 'waterMark', startedAt: minutesAgo(4) }],
      startedAt: minutesAgo(4),
      stationId: '1',
    },
  ]
  const screen = await render(
    <Frame>
      <StationTurnControls eventType="NOU" onTurn={async () => {}} station={{ id: '1', tasks: 1 }} turns={day} />
    </Frame>
  )

  await expect.element(screen.getByText('Seuraava vaihe: Haku')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('station-turn-next-phase')
})

// Before anything has happened: the briefing is the one thing on offer, the first dog is picked and
// its run can start, and a break can be taken because the post is free.
it('opens the day on the briefing, with the first run ready to go (KOE-1259)', async () => {
  const screen = await render(
    <Frame>
      <StationTurnControls
        eventType="NOU"
        onTurn={async () => {}}
        selectedDog={{ id: 'run-1', name: 'ANNALOUGHAN ACE', number: 1 }}
        station={{ id: '1', tasks: 1 }}
        turns={[]}
      />
    </Frame>
  )

  await expect.element(screen.getByText('Rasti vapaa')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('station-turn-day-start')
})
