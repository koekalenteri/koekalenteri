import type { ConfirmedEvent, Registration } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { Suspense } from 'react'
import { commands, page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStations, RESULTS_EVENT_DAY, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import { Path } from '@/routeConfig'
import { TestProvider } from '@/test-utils/AtomProvider'
import { freezeClockAt } from '@/test-utils/freezeClock'
import { describeInLanguage } from '@/test-utils/language'
import { DataMemoryRouter } from '@/test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import EventTeamsPage from './EventTeamsPage'
import { adminEventRegistrationsAtom, adminEventsAtom } from './state'

// A day of its own keeps what the page says about the trial from moving (KOE-1423).
freezeClockAt('2026-11-08')

// The candidates test clicks the dog list; the mouse stays there and would hover the next test's
// team name field.
afterEach(() => commands.resetMouse())

const [base] = registrationsToEventWithStations

/** An entry of the trial: a dog, its handler and where it runs. */
const entry = (id: string, dog: string, handler: string, overrides: Partial<Registration> = {}): Registration => ({
  ...base,
  dog: { ...base.dog, name: dog },
  group: { date: RESULTS_EVENT_DAY, key: 'ALO-AP', number: 1, time: 'ap' },
  handler: { ...base.handler, name: handler },
  id,
  // The admin list holds finished entries only.
  state: 'ready',
  ...overrides,
})

const registrations: Registration[] = [
  entry('dog-1', 'Koiraston Koira', 'Maila Mallinen'),
  entry('dog-2', 'Lintulan Lennokki', 'Pekka Peltola'),
  entry('dog-3', 'Rantasuon Ruska', 'Anna Aaltonen', { cancelled: true }),
  entry('dog-4', 'Metsälän Myrsky', 'Ville Virtanen', { group: { key: 'reserve', number: 1 } }),
  entry('dog-5', 'Kultakuonon Kide', 'Sari Saarinen'),
]

// One team named and full of what can happen to its dogs, one with a dog and no name, one still empty.
const event: ConfirmedEvent = {
  ...eventWithStations,
  teams: [
    { name: 'Loistavat Lintukoirat', registrationIds: ['dog-1', 'dog-2', 'dog-3'] },
    { registrationIds: ['dog-4'] },
    { registrationIds: [] },
  ],
}

/** An entry with its round's result. */
const scored = (registration: Registration, points: number): Registration => ({
  ...registration,
  eventResult: {
    maxPoints: 60,
    points,
    result: 'ALO1',
    updatedAt: new Date('2026-11-08T10:00:00Z'),
    updatedBy: 'Sihteeri',
  },
})

// After the trial (KOE-1717): teams 1 and 2 level on points, team 2 marked the winner of the run-off.
const standingsRegistrations: Registration[] = [
  scored(entry('dog-1', 'Koiraston Koira', 'Maila Mallinen'), 50),
  scored(entry('dog-2', 'Lintulan Lennokki', 'Pekka Peltola'), 40),
  scored(entry('dog-5', 'Kultakuonon Kide', 'Sari Saarinen'), 55),
  scored(entry('dog-6', 'Suonsilmän Salama', 'Tiina Toivonen'), 35),
  scored(entry('dog-7', 'Aamukasteen Aada', 'Olli Ojala'), 45),
]
const standingsEvent: ConfirmedEvent = {
  ...eventWithStations,
  teams: [
    { name: 'Loistavat Lintukoirat', registrationIds: ['dog-1', 'dog-2'] },
    { registrationIds: ['dog-5', 'dog-6'], runOffWon: true },
    { registrationIds: ['dog-7'] },
  ],
}

// A two-day trial counting only its first day (KOE-1726), as a derby counts its qualifying day: the
// second day's dog adds nothing, and each team's result says which day its points come from.
const SECOND_DAY = '2021-02-11' as const
const countedDaysEvent: ConfirmedEvent = {
  ...standingsEvent,
  classes: [...eventWithStations.classes, ...eventWithStations.classes.map((c) => ({ ...c, date: SECOND_DAY }))],
  endDate: SECOND_DAY,
  teamCompetition: { days: [RESULTS_EVENT_DAY] },
}
const countedDaysRegistrations = standingsRegistrations.map((registration) =>
  registration.id === 'dog-6'
    ? { ...registration, group: { date: SECOND_DAY, key: 'ALO-AP', number: 1, time: 'ap' as const } }
    : registration
)

// A competition in two series (KOE-1720): teams 1 and 3 in the open one, team 2 in the breed one, each
// series ranked on its own, so teams 1 and 2, level on points, are both first.
const seriesEvent: ConfirmedEvent = {
  ...eventWithStations,
  teamCompetition: {
    series: [
      { id: 'open', name: { en: 'Open series', fi: 'Avoin sarja' } },
      { id: 'breed', name: { fi: 'Rotusarja' } },
    ],
  },
  teams: [
    { name: 'Loistavat Lintukoirat', registrationIds: ['dog-1', 'dog-2'], seriesId: 'open' },
    { registrationIds: ['dog-5', 'dog-6'], seriesId: 'breed' },
    { registrationIds: ['dog-7'], seriesId: 'open' },
  ],
}

// The ALO class picked (KOE-1725): a team takes only its picked dogs, so the reserve dog is not offered.
const pickedEvent: ConfirmedEvent = {
  ...eventWithStations,
  classes: eventWithStations.classes.map((eventClass) => ({ ...eventClass, state: 'picked' })),
  teams: [{ name: 'Loistavat Lintukoirat', registrationIds: ['dog-1'] }],
}

const renderPage = (shown: ConfirmedEvent = event, entries: Registration[] = registrations) =>
  render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 900 }}>
      <ThemeProvider theme={theme}>
        <TestProvider
          initializeState={({ set }) => {
            set(adminEventsAtom, [shown])
            set(adminEventRegistrationsAtom(shown.id), entries)
          }}
        >
          <AppSnackbarProvider>
            <Suspense fallback={<div>loading...</div>}>
              <DataMemoryRouter
                initialEntries={[Path.admin.teams(shown.id)]}
                routes={[{ element: <EventTeamsPage />, path: Path.admin.teams() }]}
              />
            </Suspense>
          </AppSnackbarProvider>
        </TestProvider>
      </ThemeProvider>
    </div>
  )

it('lists the teams with their dogs by code, a cancelled and a reserve dog marked (KOE-1714)', async () => {
  await page.viewport(900, 1500)
  const screen = await renderPage()

  await expect.element(screen.getByText('1C Rantasuon Ruska')).toBeVisible()
  await expect.element(screen.getByRole('heading', { name: 'Joukkue 3' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams')
})

it("shows each team's points and placing, and the run-off of a tie for first (KOE-1717)", async () => {
  await page.viewport(900, 1700)
  const screen = await renderPage(standingsEvent, standingsRegistrations)

  await expect.element(screen.getByText('Joukkueen tulos: 1. sija, 90 pistettä (uusintatehtävä)')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-standings')
})

// KOE-1722: a team with a dog among the participants and one on the reserve list can go either way.
const partlySelected: ConfirmedEvent = { ...eventWithStations, teams: [{ registrationIds: ['dog-1', 'dog-4'] }] }

it('tells where a team stands, and moves it whole either way (KOE-1722)', async () => {
  await page.viewport(900, 900)
  const screen = await renderPage(partlySelected)

  await expect.element(screen.getByRole('button', { name: 'Siirrä osallistujiin' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-move')
})

it('counts the days chosen, and names them beside each team result (KOE-1726)', async () => {
  await page.viewport(900, 1900)
  const screen = await renderPage(countedDaysEvent, countedDaysRegistrations)

  await expect.element(screen.getByText('Joukkueen tulos: 1. sija, 90 pistettä, ke 10.2. tuloksista')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-counted-days')
})

it('sets the series and ranks each team within its own (KOE-1720)', async () => {
  await page.viewport(900, 1900)
  const screen = await renderPage(seriesEvent, standingsRegistrations)

  await expect.element(screen.getByRole('heading', { name: 'Sarjat' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-series')
})

it('offers only the picked dogs once the class is picked (KOE-1725)', async () => {
  await page.viewport(900, 900)
  const screen = await renderPage(pickedEvent)

  await screen.getByRole('combobox', { name: 'Lisää koira' }).click()
  await expect.element(screen.getByRole('option', { name: 'Kultakuonon Kide' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-candidates')
})

describeInLanguage('en', () => {
  it('sets the series and ranks each team within its own (KOE-1720)', async () => {
    await page.viewport(900, 1900)
    const screen = await renderPage(seriesEvent, standingsRegistrations)

    await expect.element(screen.getByRole('heading', { name: 'Series' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-series-en')
  })

  it('tells where a team stands, and moves it whole either way (KOE-1722)', async () => {
    await page.viewport(900, 900)
    const screen = await renderPage(partlySelected)

    await expect.element(screen.getByRole('button', { name: 'Move to the participants' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-move-en')
  })

  it('offers only the picked dogs once the class is picked (KOE-1725)', async () => {
    await page.viewport(900, 900)
    const screen = await renderPage(pickedEvent)

    await screen.getByRole('combobox', { name: 'Add a dog' }).click()
    await expect.element(screen.getByRole('option', { name: 'Kultakuonon Kide' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-candidates-en')
  })

  it('counts the days chosen, and names them beside each team result (KOE-1726)', async () => {
    await page.viewport(900, 1900)
    const screen = await renderPage(countedDaysEvent, countedDaysRegistrations)

    await expect
      .element(screen.getByText('Team result: place 1, 90 points, from the results of Wed 10.2.'))
      .toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-counted-days-en')
  })

  it("shows each team's points and placing, and the run-off of a tie for first (KOE-1717)", async () => {
    await page.viewport(900, 1700)
    const screen = await renderPage(standingsEvent, standingsRegistrations)

    await expect.element(screen.getByText('Team result: place 1, 90 points (run-off)')).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-standings-en')
  })

  it('lists the teams with their dogs by code, a cancelled and a reserve dog marked (KOE-1714)', async () => {
    await page.viewport(900, 1500)
    const screen = await renderPage()

    await expect.element(screen.getByText('1C Rantasuon Ruska')).toBeVisible()
    await expect.element(screen.getByRole('heading', { name: 'Team 3' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-en')
  })
})
