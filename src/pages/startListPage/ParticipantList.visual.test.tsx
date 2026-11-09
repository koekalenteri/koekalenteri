import type { DayKey } from '../../types/Day'
import type { PublicConfirmedEvent } from '../../types/Event'
import type { PublicRegistration } from '../../types/Registration'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { TestProvider } from '../../test-utils/AtomProvider'
import { startOfFinnishDay } from '../../test-utils/finnishDays'
import { describeInLanguage } from '../../test-utils/language'
import { languageAtom } from '../state/user/atoms'
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
    { class: 'ALO', exercises: [{ stationId: 'r1' }, { stationId: 'r2' }, { stationId: 'r3' }, { stationId: 'r3' }] },
    {
      class: 'AVO',
      exercises: [{ stationId: 'r3' }, { stationId: 'r1' }, { stationId: 'r2' }, { stationId: 'r2' }],
      firstNumber: 1,
      lastNumber: 8,
    },
    {
      class: 'AVO',
      exercises: [{ stationId: 'r2' }, { stationId: 'r3' }, { stationId: 'r1' }, { stationId: 'r1' }],
      firstNumber: 9,
      lastNumber: 16,
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

it("tells each group's running order as posts (KOE-1665)", async () => {
  const screen = await render(
    <Frame>
      <ParticipantList event={nowt} participants={runners} />
    </Frame>
  )

  await expect.element(screen.getByText(/^ALO: suorituspaikat 1/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-rotation')
})

// A two-day team competition (KOE-1715): on the first day team 1 holds dogs of two classes, so the
// rows name their class in front of the code; team 2 runs on both days, and one dog is in no team.
const SECOND_DAY: DayKey = '2026-10-03'
const teamTrial: PublicConfirmedEvent = {
  ...event,
  classes: [
    { class: 'AVO', date: EVENT_DAY },
    { class: 'VOI', date: EVENT_DAY },
    { class: 'AVO', date: SECOND_DAY },
  ],
  endDate: SECOND_DAY,
  eventType: 'NOME-B',
  id: 'event-teams',
  name: 'NOME-B Akaa',
  startNumbersPublished: true,
}

const teamDog = (
  eventClass: 'AVO' | 'VOI',
  date: DayKey,
  name: string,
  regNo: string,
  number: number,
  team?: PublicRegistration['team']
): PublicRegistration => ({
  ...registration(name, regNo),
  class: eventClass,
  group: { date, key: `${eventClass}-${date}`, number },
  ...(team ? { team } : {}),
})

const teamFinland = { name: 'Team Finland 1', number: 1 }
const teamDogs = [
  teamDog('AVO', EVENT_DAY, 'WATERFOWLER OAKLEAF', 'FI10724/23', 1, { ...teamFinland, code: '1A' }),
  teamDog('AVO', EVENT_DAY, 'WATERFOWLER ODIN', 'FI10716/23', 2, { code: '2A', number: 2 }),
  teamDog('VOI', EVENT_DAY, 'WATERFOWLER ONNI', 'FI10718/23', 3, { ...teamFinland, code: '1B' }),
  { ...teamDog('VOI', EVENT_DAY, 'WATERFOWLER OTSO', 'FI10720/23', 4), result: 'VOI1' },
  teamDog('AVO', SECOND_DAY, 'WATERFOWLER OLIVIA', 'FI10722/23', 1, { code: '2B', number: 2 }),
]

it('lists a team competition by team, day by day (KOE-1715)', async () => {
  const screen = await render(
    <Frame>
      <ParticipantList event={teamTrial} participants={teamDogs} />
    </Frame>
  )

  await expect.element(screen.getByText('Team Finland 1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-teams')
})

// A two-day working test's team competition with its results out (KOE-1717): each team has a dog on
// both days, teams 1 and 2 are level on points over the trial, and team 2 won the run-off for first
// place. The same standing heads the team under each day.
const standingsTrial: PublicConfirmedEvent = {
  ...event,
  classes: [
    { class: 'AVO', date: EVENT_DAY },
    { class: 'AVO', date: SECOND_DAY },
  ],
  endDate: SECOND_DAY,
  eventType: 'NOWT',
  id: 'event-team-standings',
  name: 'NOWT Akaa',
  startNumbersPublished: true,
}
const scoredDog = (
  date: DayKey,
  name: string,
  regNo: string,
  number: number,
  points: number,
  team: PublicRegistration['team']
) => ({
  ...teamDog('AVO', date, name, regNo, number, team),
  maxPoints: 100,
  percentage: points,
  points,
  result: 'AVO1',
})
const winners = { name: 'Team Finland 1', number: 2, placement: 1, points: 170, runOff: true as const }
const runnersUp = { number: 1, placement: 2, points: 170, runOff: true as const }
const standingsDogs = [
  scoredDog(EVENT_DAY, 'WATERFOWLER OAKLEAF', 'FI10724/23', 1, 90, { ...runnersUp, code: '1A' }),
  scoredDog(EVENT_DAY, 'WATERFOWLER ODIN', 'FI10716/23', 2, 85, { ...winners, code: '2A' }),
  scoredDog(SECOND_DAY, 'WATERFOWLER OTSO', 'FI10720/23', 1, 80, { ...runnersUp, code: '1B' }),
  scoredDog(SECOND_DAY, 'WATERFOWLER OLIVIA', 'FI10722/23', 2, 85, { ...winners, code: '2B' }),
]

it("shows each team's points and placing once the results are out (KOE-1717)", async () => {
  // Taller than the default viewport, which would leave the last rows blank.
  await page.viewport(1000, 1200)
  const screen = await render(
    <Frame>
      <ParticipantList event={standingsTrial} participants={standingsDogs} />
    </Frame>
  )

  await expect.element(screen.getByText('1. sija, 170 pistettä (uusintatehtävä)').first()).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-team-standings')
})

// A team competition in two series (KOE-1720): each series has its own first place, and the team in no
// series is listed first. The rows name the series by id; the page names it from the public event.
const seriesTrial: PublicConfirmedEvent = {
  ...standingsTrial,
  id: 'event-team-series',
  teamCompetition: {
    series: [
      { id: 'open', name: { en: 'Open series', fi: 'Avoin sarja' } },
      { id: 'breed', name: { en: 'Breed series', fi: 'Rotusarja' } },
    ],
  },
}
const seriesDogs = [
  scoredDog(EVENT_DAY, 'WATERFOWLER OAKLEAF', 'FI10724/23', 1, 90, {
    code: '1A',
    number: 1,
    placement: 1,
    points: 90,
    seriesId: 'breed',
  }),
  scoredDog(EVENT_DAY, 'WATERFOWLER ODIN', 'FI10716/23', 2, 85, {
    code: '2A',
    number: 2,
    placement: 1,
    points: 85,
    seriesId: 'open',
  }),
  scoredDog(EVENT_DAY, 'WATERFOWLER OTSO', 'FI10720/23', 3, 80, {
    code: '3A',
    number: 3,
    placement: 2,
    points: 80,
    seriesId: 'open',
  }),
  scoredDog(EVENT_DAY, 'WATERFOWLER OLIVIA', 'FI10722/23', 4, 75, { code: '4A', number: 4, placement: 1, points: 75 }),
]

it('lists a team competition series by series (KOE-1720)', async () => {
  const screen = await render(
    <Frame>
      <ParticipantList event={seriesTrial} participants={seriesDogs} />
    </Frame>
  )

  await expect.element(screen.getByText('Avoin sarja')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-team-series')
})

describeInLanguage('en', () => {
  it('lists a team competition series by series (KOE-1720)', async () => {
    // A store of its own: the series name follows the language atom, which a shared store keeps Finnish.
    const screen = await render(
      <TestProvider initializeState={({ set }) => set(languageAtom, 'en')}>
        <Frame>
          <ParticipantList event={seriesTrial} participants={seriesDogs} />
        </Frame>
      </TestProvider>
    )

    await expect.element(screen.getByText('Open series')).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-team-series-en')
  })

  it("shows each team's points and placing once the results are out (KOE-1717)", async () => {
    // Taller than the default viewport, which would leave the last rows blank.
    await page.viewport(1000, 1200)
    const screen = await render(
      <Frame>
        <ParticipantList event={standingsTrial} participants={standingsDogs} />
      </Frame>
    )

    await expect.element(screen.getByText('place 1, 170 points (run-off)').first()).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-team-standings-en')
  })

  it('lists a team competition by team, day by day (KOE-1715)', async () => {
    const screen = await render(
      <Frame>
        <ParticipantList event={teamTrial} participants={teamDogs} />
      </Frame>
    )

    await expect.element(screen.getByText('No team')).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-teams-en')
  })

  it("tells each group's running order as posts (KOE-1665)", async () => {
    const screen = await render(
      <Frame>
        <ParticipantList event={nowt} participants={runners} />
      </Frame>
    )

    await expect.element(screen.getByText(/^ALO: posts 1/)).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-rotation-en')
  })
})
