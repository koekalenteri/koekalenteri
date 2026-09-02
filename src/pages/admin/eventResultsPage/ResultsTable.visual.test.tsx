import type { PublicJudge, Registration } from '../../../types'
import type { ResultEdit } from './types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { eventWithStations, registrationsToEventWithStations } from '../../../__mockData__/resultsEvent'
import theme from '../../../assets/Theme'
import { classRound } from '../../../lib/results'
import ResultsTable from './ResultsTable'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children, width = 1150 }: { readonly children: React.ReactNode; readonly width?: number }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

/** A phone's worth of width, less the page's own margins. */
const PHONE = 360

const judge: PublicJudge = { id: 223, name: 'Tuomari 2', official: true }
const noop = () => {}

/** The dogs that ran; a reserve has no row on this screen. */
const runners = registrationsToEventWithStations.filter((reg) => reg.group?.key !== 'reserve')

const round = classRound(eventWithStations.stations ?? [])
// One dog through the whole course on a first prize, one thrown out at the second post with its
// first-post score intact — the two shapes a real screenful mixes.
const nowtEdits: Record<string, ResultEdit> = {
  'run-1': {
    tasks: [
      { index: 0, judge, points: 17, stationId: 'post-1' },
      { index: 0, judge, points: 8, stationId: 'post-2' },
      { index: 1, judge, points: 9, stationId: 'post-2' },
    ],
  },
  'run-2': {
    elimination: { fault: 'hardMouth', stationId: 'post-2' },
    tasks: [{ index: 0, judge, points: 12, stationId: 'post-1' }],
  },
}

const nouJudges: PublicJudge[] = [{ id: 123, name: 'Tuomari 1', official: true }, judge]
const nouRegistrations: Registration[] = runners.map((reg) => ({
  ...reg,
  class: undefined,
  eventType: 'NOU',
}))
// A pass with its judge chosen, and an injury retirement taking the fail — nothing derivable, so
// every mark on screen is the judge's own.
const nouEdits: Record<string, ResultEdit> = {
  'run-1': { judge: nouJudges[0], resultCode: '1', tasks: [] },
  'run-2': { judge: nouJudges[0], resultCode: '0', retirement: { cause: 'injury' }, tasks: [] },
}

it('shows a working test round as the secretary scores it', async () => {
  const edits = nowtEdits

  const screen = await render(
    <Frame>
      <ResultsTable
        defaultJudges={{}}
        edits={edits}
        eventClass="ALO"
        eventType="NOWT"
        fullRound={round}
        judgesFor={() => [judge]}
        onChange={noop}
        onJudgeChange={noop}
        registrations={runners}
        round={round}
        stations={eventWithStations.stations ?? []}
      />
    </Frame>
  )

  await expect.element(screen.getByText('ALO1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nowt')
})

it('shows a pass/fail round with the result and the judge as the entry', async () => {
  const edits = nouEdits
  const judges = nouJudges
  const registrations = nouRegistrations

  const screen = await render(
    <Frame>
      <ResultsTable
        defaultJudges={{}}
        edits={edits}
        eventType="NOU"
        fullRound={[]}
        judges={judges}
        judgesFor={() => []}
        onChange={noop}
        onJudgeChange={noop}
        registrations={registrations}
        round={[]}
        stations={[]}
      />
    </Frame>
  )

  await expect.element(screen.getByText('NOU1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nou')
})

// The same two rounds on a phone (KOE-1280): one card per dog, the controls under the name.
it('stacks a test round one dog under another on a phone', async () => {
  const screen = await render(
    <Frame width={PHONE}>
      <ResultsTable
        compact
        defaultJudges={{}}
        edits={nowtEdits}
        eventClass="ALO"
        eventType="NOWT"
        fullRound={round}
        judgesFor={() => [judge]}
        onChange={noop}
        onJudgeChange={noop}
        registrations={runners}
        round={round}
        stations={eventWithStations.stations ?? []}
      />
    </Frame>
  )

  await expect.element(screen.getByText('ALO1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nowt-phone')
})

it('stacks a pass/fail round one dog under another on a phone', async () => {
  const screen = await render(
    <Frame width={PHONE}>
      <ResultsTable
        compact
        defaultJudges={{}}
        edits={nouEdits}
        eventType="NOU"
        fullRound={[]}
        judges={nouJudges}
        judgesFor={() => []}
        onChange={noop}
        onJudgeChange={noop}
        registrations={nouRegistrations}
        round={[]}
        stations={[]}
      />
    </Frame>
  )

  await expect.element(screen.getByText('NOU1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nou-phone')
})
