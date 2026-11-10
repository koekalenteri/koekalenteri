import type { ConfirmedEvent, Registration } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { Suspense } from 'react'
import { commands, page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStations, RESULTS_EVENT_DAY, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import { MAX_TEAM_MEMBERS } from '@/lib/team'
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

// Teams named at entry (KOE-1721): the question asked, a first team made, two spellings of one name
// suggested as one team with the first-team mark a dog gave it, and a name of its own.
const suggestionsEvent: ConfirmedEvent = {
  ...eventWithStations,
  teamCompetition: { askAtEntry: true },
  teams: [{ name: 'Loistavat Lintukoirat', primary: true, registrationIds: ['dog-1'] }, { registrationIds: [] }],
}
const suggestionsRegistrations: Registration[] = registrations.map((registration) => {
  const teamEntry = {
    'dog-2': { name: 'Kultaiset Noutajat' },
    'dog-4': { name: 'Metsän Väki' },
    'dog-5': { name: 'kultaiset  noutajat', primary: true as const },
  }[registration.id]
  return teamEntry ? { ...registration, teamEntry } : registration
})

// A name given by more dogs than a team holds: the suggestion is kept whole and says so.
const crowdRegistrations: Registration[] = Array.from({ length: MAX_TEAM_MEMBERS + 1 }, (_, at) =>
  entry(`crowd-${at}`, `Joukkokoira ${at + 1}`, 'Maila Mallinen', { teamEntry: { name: 'Iso Joukkue' } })
)

// Litter teams (KOE-1727): two dogs of one litter, one of another, and one whose litter is not known.
const litter = (registration: Registration, sire = 'Kultakuonon Kaiku'): Registration => ({
  ...registration,
  dog: { ...registration.dog, dam: { name: 'Kultakuonon Kide' }, dob: '2024-03-01', sire: { name: sire } },
})
const litterRegistrations: Registration[] = [
  litter(registrations[0]),
  litter(registrations[1]),
  litter(registrations[3], 'Metsälän Myrsky'),
  { ...registrations[4], dog: { ...registrations[4].dog, dam: undefined, dob: undefined, sire: undefined } },
]
const litterEvent: ConfirmedEvent = {
  ...eventWithStations,
  teamCompetition: { litters: true },
  teams: [{ name: 'Kennel Kultakuono', registrationIds: ['dog-1', 'dog-2', 'dog-4', 'dog-5'] }],
}

const renderPage = (shown: ConfirmedEvent = event, entries: Registration[] = registrations, width = 900) =>
  render(
    <div data-testid="visual-root" style={{ background: '#fff', width }}>
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
  await page.viewport(900, 2300)
  const screen = await renderPage()

  await expect.element(screen.getByText('1C Rantasuon Ruska')).toBeVisible()
  await expect.element(screen.getByRole('heading', { name: 'Joukkue 3' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams')
})

it("shows each team's points and placing, and the run-off of a tie for first (KOE-1717)", async () => {
  await page.viewport(900, 2200)
  const screen = await renderPage(standingsEvent, standingsRegistrations)

  await expect.element(screen.getByText('Joukkueen tulos: 1. sija, 90 pistettä (uusintatehtävä)')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-standings')
})

// KOE-1722: a team with a dog among the participants and one on the reserve list can go either way,
// while the trial is ahead (the page's day is 8.11.2026) and its class not yet picked.
const AHEAD = '2026-11-21' as const
const partlySelected: ConfirmedEvent = {
  ...eventWithStations,
  classes: eventWithStations.classes.map((eventClass) => ({ ...eventClass, date: AHEAD })),
  endDate: AHEAD,
  startDate: AHEAD,
  teams: [{ registrationIds: ['dog-1', 'dog-4'] }],
}

it('tells where a team stands, and moves it whole either way (KOE-1722)', async () => {
  await page.viewport(900, 1200)
  const screen = await renderPage(partlySelected)

  await expect.element(screen.getByRole('button', { name: 'Siirrä osallistujiin' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-move')
})

it('counts the days chosen, and names them beside each team result (KOE-1726)', async () => {
  await page.viewport(900, 2400)
  const screen = await renderPage(countedDaysEvent, countedDaysRegistrations)

  await expect.element(screen.getByText('Joukkueen tulos: 1. sija, 90 pistettä, ke 10.2. tuloksista')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-counted-days')
})

it('sets the series and ranks each team within its own (KOE-1720)', async () => {
  await page.viewport(900, 2400)
  const screen = await renderPage(seriesEvent, standingsRegistrations)

  await expect.element(screen.getByRole('heading', { name: 'Sarjat' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-series')
})

it('offers only the picked dogs once the class is picked (KOE-1725)', async () => {
  await page.viewport(900, 1300)
  const screen = await renderPage(pickedEvent)

  await screen.getByRole('combobox', { name: 'Lisää koira' }).click()
  await expect.element(screen.getByRole('option', { name: 'Kultakuonon Kide, ohj. Sari Saarinen' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-candidates')
})

it('asks for the team at entry and suggests the teams named there (KOE-1721)', async () => {
  await page.viewport(900, 1800)
  const screen = await renderPage(suggestionsEvent, suggestionsRegistrations)

  await expect.element(screen.getByRole('heading', { name: 'Ehdotetut joukkueet' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-suggestions')
})

it('says a suggestion holds more dogs than a team (KOE-1721)', async () => {
  await page.viewport(900, 1300)
  const screen = await renderPage({ ...eventWithStations, teamCompetition: { askAtEntry: true } }, crowdRegistrations)

  await expect.element(screen.getByText(/^Ehdotuksessa on enemmän koiria/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-suggestion-too-many')
})

it('marks the dogs of another litter in a litter team (KOE-1727)', async () => {
  await page.viewport(900, 1600)
  const screen = await renderPage(litterEvent, litterRegistrations)

  await expect.element(screen.getByText('Eri pentue', { exact: true })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-litters')
})

// KOE-1725: the teams are put together at the trial office on a phone, so the page fits one.
const PHONE = { height: 2600, width: 390 }

/**
 * The elements that reach past the phone's screen, by class, the first few: the page's, and the option
 * list's, which the autocomplete portals to the end of the document.
 */
const pastTheScreen = (root: Element) =>
  [root, ...document.querySelectorAll('.MuiAutocomplete-popper')]
    .flatMap((scope) => [scope, ...scope.querySelectorAll('*')])
    .filter((element) => element.getBoundingClientRect().right > PHONE.width + 0.5)
    .map((element) => element.className || element.tagName)
    .slice(0, 5)

// A dog found by its handler's name, with its published start number and its handler on the option.
const numberedRegistrations = registrations.map((registration, at) => ({
  ...registration,
  startGroup: registration.group?.date ? { ...registration.group, number: 21 + at } : undefined,
}))

/** The page at a phone's width, in the series view, once its first team shows; nothing past the screen. */
const renderPhone = async (teamHeading: string) => {
  await page.viewport(PHONE.width, PHONE.height)
  const screen = await renderPage(seriesEvent, standingsRegistrations, PHONE.width)
  await expect.element(screen.getByRole('heading', { name: teamHeading })).toBeVisible()
  expect(pastTheScreen(screen.getByTestId('visual-root').element())).toEqual([])
  return screen
}

/** The add-a-dog list at a phone's width, the dog found by part of its handler's name. */
const renderPhoneSearch = async (addDog: string) => {
  await page.viewport(PHONE.width, 1400)
  const screen = await renderPage(pickedEvent, numberedRegistrations, PHONE.width)
  await screen.getByRole('combobox', { name: addDog }).fill('saari')
  await expect.element(screen.getByRole('option')).toBeVisible()
  // The option list is checked too: it is not inside the page.
  expect(document.querySelectorAll('.MuiAutocomplete-popper')).toHaveLength(1)
  expect(pastTheScreen(screen.getByTestId('visual-root').element())).toEqual([])
  return screen
}

it('fits a phone, nothing reaching past the screen (KOE-1725)', async () => {
  const screen = await renderPhone('Joukkue 1')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-phone')
})

it('finds a dog to add by its handler on a phone (KOE-1725)', async () => {
  const screen = await renderPhoneSearch('Lisää koira')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-phone-search')
})

describeInLanguage('en', () => {
  it('fits a phone, nothing reaching past the screen (KOE-1725)', async () => {
    const screen = await renderPhone('Team 1')
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-phone-en')
  })

  it('finds a dog to add by its handler on a phone (KOE-1725)', async () => {
    const screen = await renderPhoneSearch('Add a dog')
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-phone-search-en')
  })

  it('marks the dogs of another litter in a litter team (KOE-1727)', async () => {
    await page.viewport(900, 1600)
    const screen = await renderPage(litterEvent, litterRegistrations)

    await expect.element(screen.getByText('Another litter', { exact: true })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-litters-en')
  })

  it('asks for the team at entry and suggests the teams named there (KOE-1721)', async () => {
    await page.viewport(900, 1800)
    const screen = await renderPage(suggestionsEvent, suggestionsRegistrations)

    await expect.element(screen.getByRole('heading', { name: 'Suggested teams' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-suggestions-en')
  })

  it('sets the series and ranks each team within its own (KOE-1720)', async () => {
    await page.viewport(900, 2400)
    const screen = await renderPage(seriesEvent, standingsRegistrations)

    await expect.element(screen.getByRole('heading', { name: 'Series' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-series-en')
  })

  it('tells where a team stands, and moves it whole either way (KOE-1722)', async () => {
    await page.viewport(900, 1200)
    const screen = await renderPage(partlySelected)

    await expect.element(screen.getByRole('button', { name: 'Move to the participants' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-move-en')
  })

  it('offers only the picked dogs once the class is picked (KOE-1725)', async () => {
    await page.viewport(900, 1300)
    const screen = await renderPage(pickedEvent)

    await screen.getByRole('combobox', { name: 'Add a dog' }).click()
    await expect.element(screen.getByRole('option', { name: 'Kultakuonon Kide, handler Sari Saarinen' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-candidates-en')
  })

  it('counts the days chosen, and names them beside each team result (KOE-1726)', async () => {
    await page.viewport(900, 2400)
    const screen = await renderPage(countedDaysEvent, countedDaysRegistrations)

    await expect
      .element(screen.getByText('Team result: place 1, 90 points, from the results of Wed 10.2.'))
      .toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-counted-days-en')
  })

  it("shows each team's points and placing, and the run-off of a tie for first (KOE-1717)", async () => {
    await page.viewport(900, 2200)
    const screen = await renderPage(standingsEvent, standingsRegistrations)

    await expect.element(screen.getByText('Team result: place 1, 90 points (run-off)')).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-standings-en')
  })

  it('lists the teams with their dogs by code, a cancelled and a reserve dog marked (KOE-1714)', async () => {
    await page.viewport(900, 2300)
    const screen = await renderPage()

    await expect.element(screen.getByText('1C Rantasuon Ruska')).toBeVisible()
    await expect.element(screen.getByRole('heading', { name: 'Team 3' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-en')
  })
})
