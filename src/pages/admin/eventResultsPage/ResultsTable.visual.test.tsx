import type { KcBadge } from '@/lib/kennelliittoResults'
import type { ExerciseSlot } from '@/lib/resultTasks'
import type { PublicJudge, Registration } from '@/types'
import type { ResultEdit } from '../../components/stationScoring/types'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStations, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import { placementsFor } from '@/lib/results'
import { dogRound, roundColumns } from '@/lib/resultTasks'
import { rotationDogOf } from '@/lib/rotation'
import { describeInLanguage } from '@/test-utils/language'
import ResultsTable from './ResultsTable'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children, width = 1280 }: { readonly children: React.ReactNode; readonly width?: number }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

/** A phone's worth of width, less the page's own margins. */
const PHONE = 360

const judge: PublicJudge = { id: 223, name: 'Tuomari 2', official: true }
const noop = () => {}

// Registered names are upper case and long, so the dog's cell has to take one that does not fit a column.
const realNames = ["MIDDLE RIVER'S DRAGON VERMAX", 'GOLDWOOD TIGER LILY RH']
/** The dogs that ran; a reserve has no row on this screen. */
const runners = registrationsToEventWithStations
  .filter((reg) => reg.group?.key !== 'reserve')
  .map((reg, index) => (realNames[index] ? { ...reg, dog: { ...reg.dog, name: realNames[index] } } : reg))

// Every dog of the fixture is one group, so one round stands for all of them.
const round = dogRound(eventWithStations, rotationDogOf(registrationsToEventWithStations[0]))
const roundOf = () => round
// A working test is always four or five exercises, one of which may be split in two: six score columns
// at the most, and that is the width the table has to fit.
const wholeCourse: ExerciseSlot[] = [1, 2, 3, 4, 5].flatMap((exercise) =>
  (exercise === 3 ? [0, 1] : [0]).map((part) => ({
    exercise,
    maxPoints: exercise === 3 ? 10 : 20,
    part,
    parts: exercise === 3 ? 2 : 1,
    stationId: exercise % 2 ? 'post-1' : 'post-2',
  }))
)
const wholeCourseOf = () => wholeCourse
// One dog through the whole course on a first prize, and one whose handler withdrew it at the first
// post: the score it earned there stays an input and counts in its total, the post it never reached reads
// "kesk", and the result is the nought without "Kesk." beside it, as Kennelliitto publishes a handler's
// own withdrawal (KOE-1669).
const nowtEdits: Record<string, ResultEdit> = {
  'run-1': {
    tasks: [
      { exercise: 1, judge, part: 0, points: 18 },
      { exercise: 2, judge, part: 0, points: 17 },
      { exercise: 3, judge, part: 0, points: 9 },
      { exercise: 3, judge, part: 1, points: 9 },
      { exercise: 4, judge, part: 0, points: 19 },
      { exercise: 5, judge, part: 0, points: 18 },
    ],
  },
  'run-2': {
    retirement: { cause: 'handlerChoice', exercise: 1 },
    tasks: [{ exercise: 1, judge, part: 0, points: 12 }],
  },
}

const nouJudges: PublicJudge[] = [{ id: 123, name: 'Tuomari 1', official: true }, judge]
const nouRegistrations: Registration[] = runners.map((reg) => ({
  ...reg,
  class: undefined,
  eventType: 'NOU',
}))
// A pass and a fail with their judge chosen: nothing derivable, so every mark on screen is the judge's
// own. A taipumuskoe has no stop, so there is no interruption column either (KOE-1643).
const nouEdits: Record<string, ResultEdit> = {
  'run-1': { judge: nouJudges[0], resultCode: '1', tasks: [] },
  'run-2': { judge: nouJudges[0], resultCode: '0', tasks: [] },
}

const nomeBRegistrations: Registration[] = runners.map((reg) => ({ ...reg, eventType: 'NOME-B' }))
// A qualitative format that does have a stop. A stop fills in the nought it is published as, and the
// mark beside it says the trial ended early rather than the dog going unplaced on its merits. Beside the
// prize the stop is greyed out: a prize cannot carry one (KOE-1300).
const nomeBEdits: Record<string, ResultEdit> = {
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
    fullRoundFor={wholeCourseOf}
    judgesFor={() => [judge]}
    onChange={noop}
    onJudgeChange={noop}
    registrations={runners}
    round={wholeCourse}
    roundFor={wholeCourseOf}
    wholeRoundFor={wholeCourseOf}
    stations={eventWithStations.stations ?? []}
  />
)

/** A NOME-B class's sheet: the result entered, and the interruption beside it. */
const nomeBTable = () => (
  <ResultsTable
    defaultJudges={{}}
    edits={nomeBEdits}
    eventClass="ALO"
    eventType="NOME-B"
    judges={nouJudges}
    judgesFor={() => []}
    onChange={noop}
    onJudgeChange={noop}
    registrations={nomeBRegistrations}
    round={[]}
    roundFor={() => []}
    wholeRoundFor={() => []}
    stations={[]}
  />
)

/** The pass/fail round's sheet, as a table or as the phone's cards. */
const nouTable = (compact = false) => (
  <ResultsTable
    compact={compact}
    defaultJudges={{}}
    edits={nouEdits}
    eventType="NOU"
    judges={nouJudges}
    judgesFor={() => []}
    onChange={noop}
    onJudgeChange={noop}
    registrations={nouRegistrations}
    round={[]}
    roundFor={() => []}
    wholeRoundFor={() => []}
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
  {
    ...nouRegistrations[0],
    dog: { ...nouRegistrations[0].dog, name: 'Viides', regNo: 'REG-run-5' },
    eventResult: resultAt('2026-09-26T09:00:00Z', 'NOU1'),
    id: 'run-5',
  },
  {
    ...nouRegistrations[0],
    dog: { ...nouRegistrations[0].dog, name: 'Kuudes', regNo: 'REG-run-6' },
    eventResult: undefined,
    id: 'run-6',
    kcResult: { at: sentAt, by: 'Sihteeri', payloadHash: 'h', status: 'sent' },
  },
]

/** Where each dog stands, as `kcResultBadges` reads them: one of each badge a dog with a result shows. */
const kcBadges = new Map<string, KcBadge>([
  ['run-1', { problems: [], status: 'unchanged' }],
  ['run-2', { problems: [], status: 'changed' }],
  ['run-3', { problems: [], status: 'failed' }],
  ['run-4', { problems: [], status: 'ready' }],
  ['run-5', { problems: [{ code: 'judgeWithoutNumber', detail: 'Ulkomaalainen' }], status: 'blocked' }],
  ['run-6', { problems: [], status: 'sentGone' }],
])

const kcTable = (compact = false) => (
  <ResultsTable
    compact={compact}
    defaultJudges={{}}
    edits={{}}
    eventType="NOU"
    judges={nouJudges}
    judgesFor={() => []}
    kennelliitto={kcBadges}
    onChange={noop}
    onJudgeChange={noop}
    registrations={kcRegistrations}
    round={[]}
    roundFor={() => []}
    wholeRoundFor={() => []}
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
    { exercise: 1, part: 0, points: points[0], updatedAt: '2021-02-10T10:00:00Z', updatedBy: 'Rasti 1' },
    { exercise: 2, part: 0, points: points[1], updatedAt: '2021-02-10T10:00:00Z', updatedBy: 'Rasti 2' },
    { exercise: 2, part: 1, points: points[2], updatedAt: '2021-02-10T10:00:00Z', updatedBy: 'Rasti 2' },
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
        fullRoundFor={roundOf}
        judgesFor={() => [judge]}
        onChange={noop}
        onJudgeChange={noop}
        placements={placementsFor(placed)}
        registrations={placed}
        round={round}
        roundFor={roundOf}
        wholeRoundFor={roundOf}
        stations={eventWithStations.stations ?? []}
      />
    </Frame>
  )

  await expect.element(screen.getByText('ALO1')).toBeVisible()
  await expect.element(screen.getByText('Sija 1')).toBeVisible()
  await expect.element(screen.getByText('Sija 2').first()).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nowt-placement')
})

// One class in two groups by start number (KOE-1665): the first group starts at post 1 and does its last
// two exercises at post 2, the second starts at post 2 and does its last two at post 1. The columns are
// the exercise numbers, "Rasti 1".."Rasti 3", whatever post each group did them at.
const split = {
  ...eventWithStations,
  rotations: [
    {
      class: 'ALO' as const,
      exercises: [
        { stationId: 'post-1' },
        { parts: 1 as const, stationId: 'post-2' },
        { parts: 1 as const, stationId: 'post-2' },
      ],
      firstNumber: 1,
      lastNumber: 1,
    },
    {
      class: 'ALO' as const,
      exercises: [{ parts: 1 as const, stationId: 'post-2' }, { stationId: 'post-1' }, { stationId: 'post-1' }],
      firstNumber: 2,
      lastNumber: 9,
    },
  ],
}
const splitRound = (registration: Registration) => dogRound(split, rotationDogOf(registration))
const splitEdits: Record<string, ResultEdit> = {
  'run-1': {
    tasks: [
      { exercise: 1, judge, part: 0, points: 17 },
      { exercise: 2, judge, part: 0, points: 16 },
      { exercise: 3, judge, part: 0, points: 18 },
    ],
  },
  'run-2': {
    tasks: [
      { exercise: 1, judge, part: 0, points: 15 },
      { exercise: 2, judge, part: 0, points: 14 },
      { exercise: 3, judge, part: 0, points: 19 },
    ],
  },
}

it('names the columns by exercise number whatever post each group did them at', async () => {
  const screen = await render(
    <Frame>
      <ResultsTable
        defaultJudges={{}}
        edits={splitEdits}
        eventClass="ALO"
        eventType="NOWT"
        fullRoundFor={splitRound}
        judgesFor={() => [judge]}
        onChange={noop}
        onJudgeChange={noop}
        registrations={runners}
        round={roundColumns(runners.map(splitRound))}
        roundFor={splitRound}
        wholeRoundFor={splitRound}
        stations={eventWithStations.stations ?? []}
      />
    </Frame>
  )

  await expect.element(screen.getByText('Rasti 3')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nowt-groups')
})

it('shows a pass/fail round with the result and the judge as the entry', async () => {
  const screen = await render(<Frame>{nouTable()}</Frame>)

  await expect.element(screen.getByText('NOU1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nou')
})

it('shows a NOME-B class with the interruption beside the result', async () => {
  const screen = await render(<Frame>{nomeBTable()}</Frame>)

  await expect.element(screen.getByText('ALO1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nome-b')
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

// NOME-A's results read as KoiraNet lists them, A1 and A-, though they are stored as NOME-A1 (KOE-1592).
// The page passes a classless trial's event type as its class, and so does this.
const nomeARegistrations: Registration[] = [
  { ...nouRegistrations[0], eventResult: resultAt('2026-10-21T09:00:00Z', 'NOME-A1'), eventType: 'NOME-A' },
  { ...nouRegistrations[1], eventResult: resultAt('2026-10-21T09:30:00Z', 'NOME-A-'), eventType: 'NOME-A' },
]

it('shows a NOME-A result as Kennelliitto lists it (KOE-1592)', async () => {
  const screen = await render(
    <Frame>
      <ResultsTable
        defaultJudges={{}}
        edits={{}}
        eventClass="NOME-A"
        eventType="NOME-A"
        judges={nouJudges}
        judgesFor={() => []}
        onChange={noop}
        onJudgeChange={noop}
        registrations={nomeARegistrations}
        round={[]}
        roundFor={() => []}
        wholeRoundFor={() => []}
        stations={[]}
      />
    </Frame>
  )

  await expect.element(screen.getByText('A1', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('A-', { exact: true })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nome-a')
})

// The guide's English page shows both sheets in English (KOE-1437).
describeInLanguage('en', () => {
  it('shows a working test round as the secretary scores it', async () => {
    const screen = await render(<Frame>{nowtTable()}</Frame>)

    await expect.element(screen.getByText('ALO1')).toBeVisible()
    await expect.element(screen.getByRole('columnheader', { name: 'Team' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nowt-en')
  })

  it('shows a pass/fail round with the result and the judge as the entry', async () => {
    const screen = await render(<Frame>{nouTable()}</Frame>)

    await expect.element(screen.getByText('NOU1')).toBeVisible()
    await expect.element(screen.getByRole('columnheader', { name: 'Team' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nou-en')
  })

  it('shows a NOME-B class with the interruption beside the result', async () => {
    const screen = await render(<Frame>{nomeBTable()}</Frame>)

    await expect.element(screen.getByText('ALO1')).toBeVisible()
    await expect.element(screen.getByRole('columnheader', { name: 'Team' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-nome-b-en')
  })
})

// Last in the file: it takes the viewport its six cards need, and the sheets above keep the default one.
it('shows the same on a phone', async () => {
  await page.viewport(PHONE + 40, 1300)
  const screen = await render(<Frame width={PHONE}>{kcTable(true)}</Frame>)

  await expect.element(screen.getByText('Muuttunut')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('results-entry-kennelliitto-phone')
})
