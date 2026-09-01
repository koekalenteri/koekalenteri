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

const closed = (id: string, from: number, to: number): StationTurnItem => ({
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
      { mark: 'found', name: 'ANNALOUGHAN ACE', number: 1 },
      { mark: 'notFound', name: 'WATERFOWLER ODIN', number: 2 },
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

  await expect.element(screen.getByText('3 PORTLEDGE PENELOPE · Eye wipe')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('station-turn-marks')
})
