import type { PublicJudge, Registration } from '@/types'
import type { ResultEdit } from '../../components/stationScoring/types'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStations, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import { classRound, placementsFor } from '@/lib/results'
import { describeInLanguage } from '@/test-utils/language'
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
// One dog through the whole course on a first prize, one the judge stopped at the second post with its
// first-post score intact — the two shapes a real screenful mixes. The stop reads as the nought and
// carries "Kesk." beside it (KOE-1300).
const nowtEdits: Record<string, ResultEdit> = {
  'run-1': {
    tasks: [
      { index: 0, judge, points: 17, stationId: 'post-1' },
      { index: 0, judge, points: 8, stationId: 'post-2' },
      { index: 1, judge, points: 9, stationId: 'post-2' },
    ],
  },
  'run-2': {
    retirement: { cause: 'judgeStopped', stationId: 'post-2' },
    tasks: [{ index: 0, judge, points: 12, stationId: 'post-1' }],
  },
}

const nouJudges: PublicJudge[] = [{ id: 123, name: 'Tuomari 1', official: true }, judge]
const nouRegistrations: Registration[] = runners.map((reg) => ({
  ...reg,
  class: undefined,
  eventType: 'NOU',
}))
// A pass with its judge chosen, and a stopped trial beside it — nothing derivable, so every mark on
// screen is the judge's own. A stop fills in the nought it is published as, and the mark beside it says
// the trial ended early rather than the dog going unplaced on its merits. Beside the pass the stop is
// greyed out: a prize cannot carry one (KOE-1300).
const nouEdits: Record<string, ResultEdit> = {
  'run-1': { judge: nouJudges[0], resultCode: '1', tasks: [] },
  'run-2': { judge: nouJudges[0], resultCode: '0', retirement: { cause: 'judgeStopped' }, tasks: [] },
}

/** The working test round's sheet, as a table or as the phone's cards. */
const nowtTable = (compact = false) => (
  <ResultsTable
    compact={compact}
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
)

/** The pass/fail round's sheet, as a table or as the phone's cards. */
const nouTable = (compact = false) => (
  <ResultsTable
    compact={compact}
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
)

it('shows a working test round as the secretary scores it', async () => {
  const screen = await render(<Frame>{nowtTable()}</Frame>)

  await expect.element(screen.getByText('ALO1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nowt')
})

// What sending to Omakoira came to, dog by dog (KOE-1140): sent as it stands, edited since, refused with
// Kennelliitto's reason, and not yet sent.
const sentAt = new Date('2026-09-26T10:00:00Z')
const resultAt = (updatedAt: string, result: string) => ({
  result,
  updatedAt: new Date(updatedAt),
  updatedBy: 'Sihteeri',
})
const kcRegistrations: Registration[] = [
  {
    ...nouRegistrations[0],
    eventResult: resultAt('2026-09-26T09:00:00Z', 'NOU1'),
    kcResult: {
      at: sentAt,
      by: 'Sihteeri',
      payloadHash: 'h',
      resultVersion: '2026-09-26T09:00:00.000Z',
      status: 'sent',
    },
  },
  {
    ...nouRegistrations[1],
    eventResult: resultAt('2026-09-26T09:30:00Z', 'NOU0'),
    kcResult: {
      at: sentAt,
      by: 'Sihteeri',
      payloadHash: 'h',
      resultVersion: '2026-09-26T09:00:00.000Z',
      status: 'sent',
    },
  },
  {
    ...nouRegistrations[0],
    dog: { ...nouRegistrations[0].dog, name: 'Kolmas', regNo: 'REG-run-3' },
    eventResult: resultAt('2026-09-26T09:00:00Z', 'NOU1'),
    id: 'run-3',
    kcResult: { at: sentAt, by: 'Sihteeri', errors: ['Koiran nimi ei täsmää.'], status: 'failed' },
  },
  {
    ...nouRegistrations[0],
    dog: { ...nouRegistrations[0].dog, name: 'Neljäs', regNo: 'REG-run-4' },
    eventResult: resultAt('2026-09-26T09:00:00Z', 'NOU1'),
    id: 'run-4',
  },
]

const kcTable = (compact = false) => (
  <ResultsTable
    compact={compact}
    defaultJudges={{}}
    edits={{}}
    eventType="NOU"
    fullRound={[]}
    judges={nouJudges}
    judgesFor={() => []}
    kennelliitto
    onChange={noop}
    onJudgeChange={noop}
    registrations={kcRegistrations}
    round={[]}
    stations={[]}
  />
)

it('shows where each dog stands with Omakoira beside its result (KOE-1140)', async () => {
  const screen = await render(<Frame>{kcTable()}</Frame>)

  await expect.element(screen.getByText('Muuttunut')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-kennelliitto')
})

// Stored results, nothing being edited: the rank of each awarded dog shows under its prize, tied dogs
// sharing one.
const storedResult = (points: number[], result: string): Registration['eventResult'] => ({
  maxPoints: 40,
  points: points.reduce((sum, value) => sum + value, 0),
  result,
  tasks: [
    { index: 0, points: points[0], stationId: 'post-1', updatedAt: '2021-02-10T10:00:00Z', updatedBy: 'Rasti 1' },
    { index: 0, points: points[1], stationId: 'post-2', updatedAt: '2021-02-10T10:00:00Z', updatedBy: 'Rasti 2' },
    { index: 1, points: points[2], stationId: 'post-2', updatedAt: '2021-02-10T10:00:00Z', updatedBy: 'Rasti 2' },
  ],
  updatedAt: '2021-02-10T10:00:00Z',
  updatedBy: 'Rasti 2',
})
const placed: Registration[] = [
  { ...runners[0], eventResult: storedResult([20, 10, 10], 'ALO1') },
  { ...runners[1], eventResult: storedResult([15, 5, 5], 'ALO3') },
  {
    ...runners[0],
    dog: { ...runners[0].dog, name: 'Kolmas', regNo: 'REG-run-3' },
    eventResult: storedResult([15, 5, 5], 'ALO3'),
    group: { ...runners[0].group, key: 'ALO-AP', number: 3 },
    handler: { ...runners[0].handler, name: 'Kolmas ohjaaja' },
    id: 'run-3',
  },
]

it('shows the rank of each awarded dog beside its prize', async () => {
  const screen = await render(
    <Frame>
      <ResultsTable
        defaultJudges={{}}
        edits={{}}
        eventClass="ALO"
        eventType="NOWT"
        fullRound={round}
        judgesFor={() => [judge]}
        onChange={noop}
        onJudgeChange={noop}
        placements={placementsFor(placed)}
        registrations={placed}
        round={round}
        stations={eventWithStations.stations ?? []}
      />
    </Frame>
  )

  await expect.element(screen.getByText('ALO1')).toBeVisible()
  await expect.element(screen.getByText('Sija 1')).toBeVisible()
  await expect.element(screen.getByText('Sija 2').first()).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nowt-placement')
})

it('shows a pass/fail round with the result and the judge as the entry', async () => {
  const screen = await render(<Frame>{nouTable()}</Frame>)

  await expect.element(screen.getByText('NOU1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nou')
})

// The same two rounds on a phone (KOE-1280): one card per dog, the controls under the name.
it('stacks a test round one dog under another on a phone', async () => {
  const screen = await render(<Frame width={PHONE}>{nowtTable(true)}</Frame>)

  await expect.element(screen.getByText('ALO1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nowt-phone')
})

it('stacks a pass/fail round one dog under another on a phone', async () => {
  const screen = await render(<Frame width={PHONE}>{nouTable(true)}</Frame>)

  await expect.element(screen.getByText('NOU1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nou-phone')
})

// The guide's English page shows both sheets in English (KOE-1437).
describeInLanguage('en', () => {
  it('shows a working test round as the secretary scores it', async () => {
    const screen = await render(<Frame>{nowtTable()}</Frame>)

    await expect.element(screen.getByText('ALO1')).toBeVisible()
    await expect.element(screen.getByRole('columnheader', { name: 'Dog' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nowt-en')
  })

  it('shows a pass/fail round with the result and the judge as the entry', async () => {
    const screen = await render(<Frame>{nouTable()}</Frame>)

    await expect.element(screen.getByText('NOU1')).toBeVisible()
    await expect.element(screen.getByRole('columnheader', { name: 'Dog' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nou-en')
  })
})

// Last in the file: it takes the viewport its four cards need, and the sheets above keep the default one.
it('shows the same on a phone', async () => {
  await page.viewport(PHONE + 40, 1100)
  const screen = await render(<Frame width={PHONE}>{kcTable(true)}</Frame>)

  await expect.element(screen.getByText('Muuttunut')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-kennelliitto-phone')
})
