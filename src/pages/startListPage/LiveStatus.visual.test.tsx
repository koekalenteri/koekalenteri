import type { PublicConfirmedEvent } from '../../types/Event'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { LiveStatus } from './LiveStatus'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 760 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// The open turn starts a fixed distance before "now" so its elapsed minutes render stably; the
// closed spans carry fixed durations, so the pace line is stable too.
const now = Date.now()
const minutesAgo = (minutes: number) => new Date(now - minutes * 60000)

const event = {
  eventType: 'NOWT',
  id: 'event-live',
  liveTurns: [
    {
      dogs: [{ name: 'WATERFOWLER OAKLEAF', number: 3 }],
      endedAt: minutesAgo(15),
      id: 'a',
      startedAt: minutesAgo(21),
      stationId: 'post-1',
    },
    {
      dogs: [{ name: 'WATERFOWLER ODIN', number: 4 }],
      endedAt: minutesAgo(7),
      id: 'b',
      startedAt: minutesAgo(15),
      stationId: 'post-1',
    },
    { dogs: [{ name: 'PORTLEDGE PENELOPE', number: 5 }], id: 'c', startedAt: minutesAgo(7), stationId: 'post-1' },
    {
      dogs: [{ name: 'ANNALOUGHAN ACE', number: 1 }],
      endedAt: minutesAgo(2),
      id: 'd',
      startedAt: minutesAgo(8),
      stationId: 'post-2',
    },
  ],
  stations: [
    { date: minutesAgo(0), id: 'post-1', number: 1, tasks: 1 },
    { date: minutesAgo(0), id: 'post-2', number: 2, tasks: 2 },
  ],
  // The live view reads only the fields above; the minimal event converts here.
} as unknown as PublicConfirmedEvent

// Twenty starters at a post taking two at a time, six of them already through: the estimate covers
// seven turns, not fourteen, which is the whole point of dividing before multiplying.
const walkUpEvent = {
  ...event,
  liveTurns: [
    {
      dogs: [
        { name: 'ANNALOUGHAN ACE', number: 1 },
        { name: 'WATERFOWLER ODIN', number: 2 },
      ],
      endedAt: minutesAgo(14),
      id: 'w-a',
      startedAt: minutesAgo(21),
      stationId: 'post-3',
    },
    {
      dogs: [
        { name: 'PORTLEDGE PENELOPE', number: 3 },
        { name: 'WATERFOWLER OAKLEAF', number: 4 },
      ],
      endedAt: minutesAgo(8),
      id: 'w-b',
      startedAt: minutesAgo(14),
      stationId: 'post-3',
    },
    {
      dogs: [
        { name: 'GLENBRIAR GRACE', number: 5 },
        { name: 'HEATHERBRAE HUGO', number: 6 },
      ],
      endedAt: minutesAgo(2),
      id: 'w-c',
      startedAt: minutesAgo(8),
      stationId: 'post-3',
    },
  ],
  stations: [{ date: minutesAgo(0), dogsAtOnce: 2, id: 'post-3', number: 3, tasks: 1 }],
  // The live view reads only the fields above; the minimal event converts here.
} as unknown as PublicConfirmedEvent

it('shows who is at each post and how fast the queue is moving (KOE-1259)', async () => {
  const screen = await render(
    <Frame>
      <LiveStatus event={event} />
    </Frame>
  )

  await expect.element(screen.getByText(/PORTLEDGE PENELOPE/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('live-status')
})

it('turns the pace into the number people want: how long the queue still is (KOE-1259)', async () => {
  const screen = await render(
    <Frame>
      <LiveStatus event={walkUpEvent} participants={Array.from({ length: 20 }, () => ({}))} />
    </Frame>
  )

  await expect.element(screen.getByText(/Jonoa jäljellä/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('live-status-wait')
})
