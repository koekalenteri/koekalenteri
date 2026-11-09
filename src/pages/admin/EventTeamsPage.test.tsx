import type { ConfirmedEvent, Registration } from '@/types'
import { ThemeProvider } from '@mui/material'
import { cleanup, screen, within } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { Suspense } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStations, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import { putEvent } from '@/api/event'
import { putRegistrationGroups } from '@/api/registration'
import theme from '@/assets/Theme'
import { MAX_TEAM_MEMBERS } from '@/lib/team'
import { Path } from '@/routeConfig'
import { expectConsoleOutput } from '@/test-utils/consoleGuard'
import { DataMemoryRouter, flushPromises, renderSuspendedWithUserEvents, TEST_ID_TOKEN } from '@/test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import { idTokenAtom } from '../state'
import EventTeamsPage from './EventTeamsPage'
import { adminEventRegistrationsAtom, adminEventsAtom } from './state'

vi.mock('../../api/user')
vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')

const cancelled: Registration = {
  ...registrationsToEventWithStations[0],
  cancelled: true,
  dog: { ...registrationsToEventWithStations[0].dog, name: 'Peruja' },
  id: 'gone-1',
}
// The admin list holds finished entries only, as the page receives them.
const registrations = [...registrationsToEventWithStations, cancelled].map(
  (registration): Registration => ({ ...registration, state: 'ready' })
)

const renderPage = (event: ConfirmedEvent = eventWithStations, entries: Registration[] = registrations) =>
  renderSuspendedWithUserEvents(
    <ThemeProvider theme={theme}>
      <Provider
        initializeState={({ set }) => {
          set(idTokenAtom, TEST_ID_TOKEN)
          set(adminEventsAtom, [event])
          set(adminEventRegistrationsAtom(event.id), entries)
        }}
      >
        <Suspense fallback={<div>loading...</div>}>
          <AppSnackbarProvider>
            <ConfirmProvider>
              <DataMemoryRouter
                initialEntries={[Path.admin.teams(event.id)]}
                routes={[
                  { element: <EventTeamsPage />, path: Path.admin.teams() },
                  { element: <div>event view</div>, path: Path.admin.viewEvent() },
                ]}
              />
            </ConfirmProvider>
          </AppSnackbarProvider>
        </Suspense>
      </Provider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )

type User = Awaited<ReturnType<typeof renderPage>>['user']

const teamSections = () => screen.queryAllByRole('region')

const setCount = async (user: User, count: string) => {
  const field = screen.getByRole('spinbutton', { name: 'teams.count' })
  await user.clear(field)
  if (count) await user.type(field, count)
  await flushPromises()
}

const addDog = async (user: User, team: HTMLElement, name: string) => {
  await user.click(within(team).getByRole('combobox', { name: 'teams.addDog' }))
  await user.click(await screen.findByRole('option', { name }))
  await flushPromises()
}

/** The member lines of a team, in order: the code and the dog. */
const members = (team: HTMLElement) =>
  within(team)
    .queryAllByRole('listitem')
    .map((item) => item.querySelector('.MuiListItemText-primary')?.textContent)

describe('EventTeamsPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    // The form keeps an unsaved edit in session storage, which would carry into the next test's page.
    sessionStorage.clear()
  })
  afterAll(() => vi.useRealTimers())

  it('adds teams at the end and drops them from the end as the count changes', async () => {
    const { user } = await renderPage()
    await flushPromises()
    expect(teamSections()).toHaveLength(0)

    await setCount(user, '3')
    expect(teamSections()).toHaveLength(3)

    await user.type(within(teamSections()[0]).getByRole('textbox', { name: 'teams.name' }), 'Lintukoirat')
    await setCount(user, '1')

    expect(teamSections()).toHaveLength(1)
    expect(within(teamSections()[0]).getByRole('textbox', { name: 'teams.name' })).toHaveValue('Lintukoirat')
  })

  it('gives each dog the letter of its place, offers a dog to one team only and never a cancelled one', async () => {
    const { user } = await renderPage()
    await flushPromises()
    await setCount(user, '2')

    const [first, second] = teamSections()
    await addDog(user, first, 'Ensimmainen')
    await addDog(user, first, 'Varalla')

    expect(members(first)).toEqual(['1A Ensimmainen', '1B Varalla' + 'teams.memberReserve'])

    await user.click(within(second).getByRole('combobox', { name: 'teams.addDog' }))
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Toinen'])
  })

  // KOE-1725: once a class is picked, a team takes only the dogs picked into it, as the save holds to.
  it('offers only the picked dogs of a picked class, and keeps a reserve dog already in a team', async () => {
    const [, , waiting] = registrations
    const secondReserve = { ...waiting, dog: { ...waiting.dog, name: 'Toinen varalla' }, id: 'reserve-2' }
    const { user } = await renderPage(
      {
        ...eventWithStations,
        classes: eventWithStations.classes.map((eventClass) => ({ ...eventClass, state: 'picked' as const })),
        teams: [{ registrationIds: ['reserve-1'] }, { registrationIds: [] }],
      },
      [...registrations, secondReserve]
    )
    await flushPromises()
    const [first, second] = teamSections()

    expect(members(first)).toEqual(['1A Varalla' + 'teams.memberReserve'])
    await user.click(within(second).getByRole('combobox', { name: 'teams.addDog' }))
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Ensimmainen', 'Toinen'])
  })

  it('moves the letters with the dogs, and closes the gap a removed dog leaves', async () => {
    const { user } = await renderPage({
      ...eventWithStations,
      teams: [{ registrationIds: ['run-1', 'run-2', 'reserve-1'] }],
    })
    await flushPromises()
    const [team] = teamSections()

    expect(members(team)).toEqual(['1A Ensimmainen', '1B Toinen', '1C Varalla' + 'teams.memberReserve'])

    const [, secondUp] = within(team).getAllByRole('button', { name: 'teams.moveUp code' })
    await user.click(secondUp)
    expect(members(team)).toEqual(['1A Toinen', '1B Ensimmainen', '1C Varalla' + 'teams.memberReserve'])

    const [, secondRemove] = within(team).getAllByRole('button', { name: 'teams.remove code' })
    await user.click(secondRemove)
    expect(members(team)).toEqual(['1A Toinen', '1B Varalla' + 'teams.memberReserve'])
  })

  it('moves a dog down, but not the last one', async () => {
    const { user } = await renderPage({ ...eventWithStations, teams: [{ registrationIds: ['run-1', 'run-2'] }] })
    await flushPromises()
    const [team] = teamSections()

    const [firstDown, lastDown] = within(team).getAllByRole('button', { name: 'teams.moveDown code' })
    expect(lastDown).toBeDisabled()

    await user.click(firstDown)
    expect(members(team)).toEqual(['1A Toinen', '1B Ensimmainen'])
    expect(within(team).getAllByRole('button', { name: 'teams.moveDown code' })[1]).toBeDisabled()
  })

  it('takes no more dogs into a team of 26, and says why', async () => {
    const full = Array.from({ length: 26 }, (_, index) => `dog-${index}`)
    await renderPage({ ...eventWithStations, teams: [{ registrationIds: full }, { registrationIds: [] }] })
    await flushPromises()
    const [fullTeam, other] = teamSections()

    expect(within(fullTeam).getByRole('combobox', { name: 'teams.addDog' })).toBeDisabled()
    expect(within(fullTeam).getByText('teams.addDogFull count')).toBeInTheDocument()
    expect(within(other).getByRole('combobox', { name: 'teams.addDog' })).toBeEnabled()
    expect(within(other).queryByText('teams.addDogFull count')).not.toBeInTheDocument()
  })

  it('leaves nothing to save when the count goes up and back to nought on an event without teams', async () => {
    const { user } = await renderPage()
    await flushPromises()

    await setCount(user, '2')
    expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()

    // An empty list would differ from the stored event, which has no teams key at all.
    await setCount(user, '0')
    expect(teamSections()).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
  })

  it('keeps a member who cancelled where it was, marked, until the secretary removes it', async () => {
    await renderPage({ ...eventWithStations, teams: [{ name: 'Joukkue', registrationIds: ['gone-1', 'run-1'] }] })
    await flushPromises()

    expect(members(teamSections()[0])).toEqual(['1A Peruja' + 'teams.memberCancelled', '1B Ensimmainen'])
  })

  it('shows no line for an id the entries do not hold, and its letter stays taken', async () => {
    await renderPage({ ...eventWithStations, teams: [{ registrationIds: ['run-1', 'unknown', 'run-2'] }] })
    await flushPromises()

    expect(members(teamSections()[0])).toEqual(['1A Ensimmainen', '1C Toinen'])
  })

  it('stores no name once the name is cleared', async () => {
    vi.mocked(putEvent).mockResolvedValue(eventWithStations)
    const { user } = await renderPage({ ...eventWithStations, teams: [{ name: 'Vanha', registrationIds: [] }] })
    await flushPromises()

    await user.clear(within(teamSections()[0]).getByRole('textbox', { name: 'teams.name' }))
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(putEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ teams: [{ registrationIds: [] }] }),
      TEST_ID_TOKEN,
      undefined,
      undefined
    )
  })

  it('saves the teams the page shows', async () => {
    vi.mocked(putEvent).mockResolvedValue(eventWithStations)
    const { user } = await renderPage({ ...eventWithStations, teams: [{ registrationIds: ['run-1'] }] })
    await flushPromises()

    await user.type(within(teamSections()[0]).getByRole('textbox', { name: 'teams.name' }), 'Team Finland 1')
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(putEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: eventWithStations.id,
        teams: [{ name: 'Team Finland 1', registrationIds: ['run-1'] }],
      }),
      TEST_ID_TOKEN,
      undefined,
      undefined
    )
  })

  // KOE-1717: each team's points and placing over the trial, and the run-off that decides a tie for first.
  describe('standings', () => {
    const scored = (registration: Registration, points: number): Registration => ({
      ...registration,
      eventResult: { maxPoints: 60, points, result: 'ALO1', updatedAt: new Date(), updatedBy: 'Sihteeri' },
    })
    const teamsEvent = { ...eventWithStations, teams: [{ registrationIds: ['run-1'] }, { registrationIds: ['run-2'] }] }
    const runOff = (team: HTMLElement) => within(team).getByRole('checkbox', { name: 'teams.runOffWon' })

    it('shows each team its result, and no run-off where the teams are not level', async () => {
      await renderPage(teamsEvent, [scored(registrations[0], 50), scored(registrations[1], 40)])
      await flushPromises()

      const [first, second] = teamSections()
      expect(within(first).getByText(/^teams\.result/)).toBeInTheDocument()
      expect(within(second).getByText(/^teams\.result/)).toBeInTheDocument()
      expect(within(first).queryByRole('checkbox', { name: 'teams.runOffWon' })).not.toBeInTheDocument()
    })

    it('records one winner of the run-off for a tie for first, and saves it', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const { user } = await renderPage(teamsEvent, [scored(registrations[0], 50), scored(registrations[1], 50)])
      await flushPromises()
      const [first, second] = teamSections()

      await user.click(runOff(second))
      await user.click(runOff(first))
      await flushPromises()

      expect(runOff(first)).toBeChecked()
      expect(runOff(second)).not.toBeChecked()

      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expect(putEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          teams: [{ registrationIds: ['run-1'], runOffWon: true }, { registrationIds: ['run-2'] }],
        }),
        TEST_ID_TOKEN,
        undefined,
        undefined
      )
    })

    it('shows no result in a format without points', async () => {
      await renderPage({ ...teamsEvent, eventType: 'NOME-B' }, [
        scored(registrations[0], 50),
        scored(registrations[1], 50),
      ])
      await flushPromises()

      expect(screen.queryByText(/^teams\.result/)).not.toBeInTheDocument()
    })
  })

  // KOE-1722: a whole team goes to the participants or to the reserve list at once, one request per
  // class, as the group endpoint takes the dogs of one class; a class that fails is named by its dogs.
  describe('moving a whole team', () => {
    // Before the trial, while its classes still take moves.
    beforeEach(() => vi.setSystemTime(new Date('2021-02-01T10:00:00+02:00')))
    afterEach(() => vi.setSystemTime(vi.getRealSystemTime()))

    const onReserve = (id: string, name: string, eventClass: string): Registration => ({
      ...registrations[0],
      class: eventClass,
      dates: [{ date: eventWithStations.startDate, time: 'ap' }],
      dog: { ...registrations[0].dog, name, regNo: `REG-${id}` },
      group: { key: 'reserve', number: 1 },
      id,
    })
    const teamEntries = [onReserve('alo-1', 'Alokas', 'ALO'), onReserve('avo-1', 'Avoin', 'AVO')]
    const teamEvent = { ...eventWithStations, teams: [{ registrationIds: ['alo-1', 'avo-1'] }] }
    const moved = (entries: Registration[]) => ({
      cancelledFailed: [],
      cancelledOk: [],
      classes: eventWithStations.classes,
      entries: 2,
      invitedFailed: [],
      invitedOk: [],
      items: entries,
      pickedFailed: [],
      pickedOk: [],
      reserveFailed: [],
      reserveOk: [],
    })

    it('moves the team to the participants one class at a time, and says when it is done', async () => {
      vi.mocked(putRegistrationGroups)
        .mockResolvedValueOnce(moved(teamEntries))
        .mockResolvedValueOnce(moved(teamEntries))
      const { user } = await renderPage(teamEvent, teamEntries)
      await flushPromises()

      await user.click(within(teamSections()[0]).getByRole('button', { name: 'teams.toParticipants' }))
      await flushPromises()

      expect(putRegistrationGroups).toHaveBeenNthCalledWith(
        1,
        eventWithStations.id,
        [expect.objectContaining({ id: 'alo-1' })],
        TEST_ID_TOKEN
      )
      expect(putRegistrationGroups).toHaveBeenNthCalledWith(
        2,
        eventWithStations.id,
        [expect.objectContaining({ id: 'avo-1' })],
        TEST_ID_TOKEN
      )
      expect(screen.getByText(/^teams\.moved/)).toBeInTheDocument()
    })

    it('asks first, naming the dogs that are mailed their place, where a class is picked', async () => {
      vi.mocked(putRegistrationGroups)
        .mockResolvedValueOnce(moved(teamEntries))
        .mockResolvedValueOnce(moved(teamEntries))
      const picked = { ...teamEvent, classes: teamEvent.classes.map((c) => ({ ...c, state: 'picked' as const })) }
      const { user } = await renderPage(picked, teamEntries)
      await flushPromises()

      await user.click(within(teamSections()[0]).getByRole('button', { name: 'teams.toParticipants' }))
      await flushPromises()

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent('Alokas, Avoin')
      expect(putRegistrationGroups).not.toHaveBeenCalled()

      await user.click(within(dialog).getByRole('button', { name: 'teams.moveConfirm' }))
      await flushPromises()
      expect(putRegistrationGroups).toHaveBeenCalledTimes(2)
    })

    it('waits for the teams to be saved before a team moves', async () => {
      const { user } = await renderPage(teamEvent, teamEntries)
      await flushPromises()

      await user.type(within(teamSections()[0]).getByRole('textbox', { name: 'teams.name' }), 'Uusi')
      await flushPromises()

      expect(within(teamSections()[0]).getByRole('button', { name: 'teams.toParticipants' })).toBeDisabled()
      expect(within(teamSections()[0]).getByText('teams.moveSaveFirst')).toBeInTheDocument()
    })

    it('moves a team of participants to the reserve list', async () => {
      vi.mocked(putRegistrationGroups).mockResolvedValueOnce(moved(registrations))
      const { user } = await renderPage({ ...eventWithStations, teams: [{ registrationIds: ['run-1', 'run-2'] }] })
      await flushPromises()

      await user.click(within(teamSections()[0]).getByRole('button', { name: 'teams.toReserve' }))
      await flushPromises()

      expect(putRegistrationGroups).toHaveBeenCalledWith(
        eventWithStations.id,
        [
          { group: { key: 'reserve' }, id: 'run-1' },
          { group: { key: 'reserve' }, id: 'run-2' },
        ],
        TEST_ID_TOKEN
      )
    })

    it('keeps a picked class from sending participants back to the reserve list, and says why', async () => {
      const picked = {
        ...eventWithStations,
        classes: eventWithStations.classes.map((c) => ({ ...c, state: 'picked' as const })),
        teams: [{ registrationIds: ['run-1', 'run-2'] }],
      }
      await renderPage(picked)
      await flushPromises()

      expect(within(teamSections()[0]).getByRole('button', { name: 'teams.toReserve' })).toBeDisabled()
      expect(within(teamSections()[0]).getByText(/^teams\.moveRefused/)).toBeInTheDocument()
    })

    it('moves nothing in a class whose entries are closed, and says why', async () => {
      // The trial is over.
      vi.setSystemTime(vi.getRealSystemTime())
      await renderPage(teamEvent, teamEntries)
      await flushPromises()

      expect(within(teamSections()[0]).getByRole('button', { name: 'teams.toParticipants' })).toBeDisabled()
      expect(within(teamSections()[0]).getByText(/^teams\.moveRefused/)).toBeInTheDocument()
    })

    it('names a dog that has no group to go to, and offers no move where none can move', async () => {
      vi.mocked(putRegistrationGroups).mockResolvedValueOnce(moved(teamEntries))
      const noGroup = onReserve('voi-1', 'Voittaja', 'VOI')
      const { user } = await renderPage(
        { ...eventWithStations, teams: [{ registrationIds: ['alo-1', 'voi-1'] }, { registrationIds: ['voi-1'] }] },
        [...teamEntries, noGroup]
      )
      await flushPromises()

      expect(within(teamSections()[1]).queryByRole('button', { name: 'teams.toParticipants' })).not.toBeInTheDocument()

      await user.click(within(teamSections()[0]).getByRole('button', { name: 'teams.toParticipants' }))
      await flushPromises()

      expect(putRegistrationGroups).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/teams\.movePartlyFailed/)).toHaveTextContent('Voittaja')
    })

    it('names the dogs of a class the rule keeps where they are, and moves the others', async () => {
      const running = (id: string, name: string, eventClass: string): Registration => ({
        ...onReserve(id, name, eventClass),
        group: { date: eventWithStations.startDate, key: `${eventWithStations.startDate}-ap`, number: 1, time: 'ap' },
      })
      const entries = [running('alo-1', 'Alokas', 'ALO'), running('avo-1', 'Avoin', 'AVO')]
      vi.mocked(putRegistrationGroups).mockResolvedValueOnce(moved(entries))
      const aloPicked = {
        ...teamEvent,
        classes: teamEvent.classes.map((c) => (c.class === 'ALO' ? { ...c, state: 'picked' as const } : c)),
      }
      const { user } = await renderPage(aloPicked, entries)
      await flushPromises()

      await user.click(within(teamSections()[0]).getByRole('button', { name: 'teams.toReserve' }))
      await flushPromises()

      expect(putRegistrationGroups).toHaveBeenCalledTimes(1)
      expect(putRegistrationGroups).toHaveBeenCalledWith(
        eventWithStations.id,
        [{ group: { key: 'reserve' }, id: 'avo-1' }],
        TEST_ID_TOKEN
      )
      expect(screen.getByText(/teams\.movePartlyFailed/)).toHaveTextContent('Alokas')
    })

    it('sends the team once, though the button is clicked again while it moves', async () => {
      let land: (value: ReturnType<typeof moved>) => void = () => undefined
      vi.mocked(putRegistrationGroups)
        .mockImplementationOnce(() => new Promise((resolve) => (land = resolve)))
        .mockResolvedValueOnce(moved(teamEntries))
      const { user } = await renderPage(teamEvent, teamEntries)
      await flushPromises()
      const button = () => within(teamSections()[0]).getByRole('button', { name: 'teams.toParticipants' })

      await user.click(button())
      await flushPromises()
      expect(button()).toBeDisabled()

      land(moved(teamEntries))
      await flushPromises()
      expect(putRegistrationGroups).toHaveBeenCalledTimes(2)
    })

    it('moves the classes it can, and names the dogs of a class that did not move', async () => {
      // The failed class is reported, and the page reloads the entries, which the mock does not hold.
      expectConsoleOutput(/reportError Error: did not move/, /Unable to refresh registrations after group move failure/)
      vi.mocked(putRegistrationGroups)
        .mockResolvedValueOnce(moved(teamEntries))
        .mockRejectedValueOnce(new Error('did not move'))
      const { user } = await renderPage(teamEvent, teamEntries)
      await flushPromises()

      await user.click(within(teamSections()[0]).getByRole('button', { name: 'teams.toParticipants' }))
      await flushPromises()

      expect(putRegistrationGroups).toHaveBeenCalledTimes(2)
      expect(screen.getByText(/teams\.movePartlyFailed/)).toHaveTextContent('Avoin')
    })
  })

  // KOE-1726: the secretary chooses the days whose results the teams count; every day without a choice.
  describe('the counted days', () => {
    const SECOND_DAY = '2021-02-11' as const
    const twoDays: ConfirmedEvent = {
      ...eventWithStations,
      classes: [...eventWithStations.classes, ...eventWithStations.classes.map((c) => ({ ...c, date: SECOND_DAY }))],
      endDate: SECOND_DAY,
      teams: [{ registrationIds: ['run-1'] }],
    }
    const dayBoxes = () => within(screen.getByRole('group', { name: 'teams.countedDays' })).getAllByRole('checkbox')
    const save = async (user: User) => {
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()
    }

    it('counts every day until the secretary leaves one out, and saves the days left', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const { user } = await renderPage(twoDays)
      await flushPromises()

      expect(dayBoxes().map((box) => (box as HTMLInputElement).checked)).toEqual([true, true])
      await user.click(dayBoxes()[1])
      await save(user)

      expect(putEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamCompetition: { days: [eventWithStations.startDate] } }),
        TEST_ID_TOKEN,
        undefined,
        undefined
      )
    })

    it('stores no choice once every day is counted again, and keeps the last day counted', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const { user } = await renderPage({ ...twoDays, teamCompetition: { days: [eventWithStations.startDate] } })
      await flushPromises()

      expect(dayBoxes()[0]).toBeDisabled()
      await user.click(dayBoxes()[1])
      await save(user)

      expect(putEvent).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ teamCompetition: expect.anything() }),
        TEST_ID_TOKEN,
        undefined,
        undefined
      )
    })

    it('offers no choice for a trial of one day', async () => {
      await renderPage({ ...eventWithStations, teams: [{ registrationIds: ['run-1'] }] })
      await flushPromises()

      expect(screen.queryByRole('group', { name: 'teams.countedDays' })).not.toBeInTheDocument()
    })
  })

  // KOE-1720: a competition in series, each team in one or in none, each series ranked on its own.
  describe('series', () => {
    const series = [
      { id: 'open', name: { fi: 'Avoin' } },
      { id: 'breed', name: { en: 'Breed', fi: 'Rotu' } },
    ]
    const seriesEvent = {
      ...eventWithStations,
      teamCompetition: { series },
      teams: [{ registrationIds: ['run-1'] }, { registrationIds: ['run-2'], seriesId: 'breed' }],
    }
    const seriesPick = (team: HTMLElement) => within(team).getByRole('combobox', { name: 'teams.teamSeries' })
    const pickSeries = async (user: User, team: HTMLElement, name: string) => {
      await user.click(seriesPick(team))
      await user.click(await screen.findByRole('option', { name }))
      await flushPromises()
    }
    const expectSaved = (fields: object) =>
      expect(putEvent).toHaveBeenLastCalledWith(expect.objectContaining(fields), TEST_ID_TOKEN, undefined, undefined)

    it('adds a series, names it, puts a team in it and saves both', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const { user } = await renderPage({ ...eventWithStations, teams: [{ registrationIds: ['run-1'] }] })
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'teams.addSeries' }))
      await user.type(screen.getAllByRole('textbox', { name: 'teams.seriesName language' })[0], 'Avoin')
      await pickSeries(user, teamSections()[0], 'Avoin')
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expectSaved({
        teamCompetition: { series: [{ id: expect.any(String), name: { fi: 'Avoin' } }] },
        teams: [{ registrationIds: ['run-1'], seriesId: expect.any(String) }],
      })
    })

    it('counts a change of a team series alone as a change to save', async () => {
      const { user } = await renderPage(seriesEvent)
      await flushPromises()
      expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()

      await pickSeries(user, teamSections()[0], 'Avoin')

      expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()
    })

    it('takes a removed series out of its teams', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const { user } = await renderPage(seriesEvent)
      await flushPromises()

      await user.click(screen.getAllByRole('button', { name: 'teams.removeSeries name' })[1])
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expectSaved({
        teamCompetition: { series: [series[0]] },
        teams: [{ registrationIds: ['run-1'] }, { registrationIds: ['run-2'] }],
      })
    })

    it('takes a team out of its series', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const { user } = await renderPage(seriesEvent)
      await flushPromises()

      await pickSeries(user, teamSections()[1], 'teams.noSeries')
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expectSaved({ teams: [{ registrationIds: ['run-1'] }, { registrationIds: ['run-2'] }] })
    })

    it('keeps the save closed while a series has no Finnish name, as the save would refuse it', async () => {
      const { user } = await renderPage({ ...eventWithStations, teams: [{ registrationIds: ['run-1'] }] })
      await flushPromises()
      const save = () => screen.getByRole('button', { name: 'save' })

      await user.click(screen.getByRole('button', { name: 'teams.addSeries' }))
      expect(save()).toBeDisabled()

      const [finnish] = screen.getAllByRole('textbox', { name: 'teams.seriesName language' })
      await user.type(finnish, '  ')
      expect(save()).toBeDisabled()

      await user.type(finnish, 'Avoin')
      expect(save()).toBeEnabled()
    })

    // The question at entry is set before any team is made (KOE-1721), so the settings show on every event.
    it('shows the settings on an event with no teams and no series', async () => {
      await renderPage({ ...eventWithStations })
      await flushPromises()

      expect(screen.getByRole('heading', { name: 'teams.settings' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'teams.series' })).toBeInTheDocument()
    })

    it('removes the settings once the last series is removed', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const oneSeries = { ...seriesEvent, teamCompetition: { series: [series[1]] } }
      const { user } = await renderPage(oneSeries)
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'teams.removeSeries name' }))
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expect(putEvent).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ teamCompetition: expect.anything() }),
        TEST_ID_TOKEN,
        undefined,
        undefined
      )
      expectSaved({ teams: [{ registrationIds: ['run-1'] }, { registrationIds: ['run-2'] }] })
    })

    it('drops the run-off a team won when it moves to another series', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const won = {
        ...seriesEvent,
        teams: [{ registrationIds: ['run-1'] }, { ...seriesEvent.teams[1], runOffWon: true }],
      }
      const { user } = await renderPage(won)
      await flushPromises()

      await pickSeries(user, teamSections()[1], 'Avoin')
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expectSaved({ teams: [{ registrationIds: ['run-1'] }, { registrationIds: ['run-2'], seriesId: 'open' }] })
    })

    it('asks for the Finnish name of a series', async () => {
      const { user } = await renderPage(seriesEvent)
      await flushPromises()

      await user.clear(screen.getAllByRole('textbox', { name: 'teams.seriesName language' })[0])

      expect(screen.getByText('teams.seriesNameRequired')).toBeInTheDocument()
    })

    it('ranks each series on its own: two teams level on points in two series both first, with no run-off', async () => {
      const scored = (registration: Registration, points: number): Registration => ({
        ...registration,
        eventResult: { maxPoints: 60, points, result: 'ALO1', updatedAt: new Date(), updatedBy: 'Sihteeri' },
      })
      await renderPage(
        { ...seriesEvent, teams: [{ registrationIds: ['run-1'], seriesId: 'open' }, seriesEvent.teams[1]] },
        [scored(registrations[0], 50), scored(registrations[1], 50)]
      )
      await flushPromises()

      for (const team of teamSections()) {
        expect(within(team).queryByRole('checkbox', { name: 'teams.runOffWon' })).not.toBeInTheDocument()
      }
    })
  })

  // KOE-1727: litter teams, suggested from the dogs of one litter, and a warning for a dog of another.
  describe('litter teams', () => {
    const expectSaved = (fields: object) =>
      expect(putEvent).toHaveBeenLastCalledWith(expect.objectContaining(fields), TEST_ID_TOKEN, undefined, undefined)
    const ofLitter = (registration: Registration, sire = 'Isä'): Registration => ({
      ...registration,
      dog: { ...registration.dog, dam: { name: 'Emä' }, dob: '2024-03-01', sire: { name: sire } },
    })
    const litterEntries = [ofLitter(registrations[0]), ofLitter(registrations[1]), ofLitter(registrations[2], 'Toinen')]

    it('makes the teams litter teams once the secretary says so', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const { user } = await renderPage()
      await flushPromises()

      await user.click(screen.getByRole('checkbox', { name: 'teams.litters' }))
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expectSaved({ teamCompetition: { litters: true } })
    })

    it('suggests a litter as a team named after its parents', async () => {
      const { user } = await renderPage({ ...eventWithStations, teamCompetition: { litters: true } }, litterEntries)
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'teams.takeSuggestion name' }))
      await flushPromises()

      const [team] = teamSections()
      expect(within(team).getByRole('textbox', { name: 'teams.name' })).toHaveValue('Isä x Emä')
      expect(members(team)).toEqual(['1A Ensimmainen', '1B Toinen'])
    })

    it('marks a dog of another litter in a litter team', async () => {
      await renderPage(
        {
          ...eventWithStations,
          teamCompetition: { litters: true },
          teams: [{ registrationIds: ['run-1', 'run-2', 'reserve-1'] }],
        },
        litterEntries
      )
      await flushPromises()

      expect(members(teamSections()[0])).toEqual([
        '1A Ensimmainen',
        '1B Toinen',
        '1C Varalla' + 'teams.memberReserve' + 'teams.otherLitter',
      ])
    })

    it('marks no litter where the teams are not litter teams', async () => {
      await renderPage({ ...eventWithStations, teams: [{ registrationIds: ['run-1', 'reserve-1'] }] }, litterEntries)
      await flushPromises()

      expect(members(teamSections()[0])).toEqual(['1A Ensimmainen', '1B Varalla' + 'teams.memberReserve'])
    })
  })

  // KOE-1721: the question at entry, the teams suggested from the names given, and the first-team mark.
  describe('teams named at entry', () => {
    const expectSaved = (fields: object) =>
      expect(putEvent).toHaveBeenLastCalledWith(expect.objectContaining(fields), TEST_ID_TOKEN, undefined, undefined)
    const named = (registration: Registration, name: string, primary?: true): Registration => ({
      ...registration,
      teamEntry: { name, ...(primary ? { primary } : {}) },
    })
    const namedEntries = [
      named(registrations[0], 'Kultaiset'),
      named(registrations[1], ' kultaiset ', true),
      ...registrations.slice(2),
    ]
    const primaryBox = (team: HTMLElement) => within(team).getByRole('checkbox', { name: 'teams.primary' })

    it('asks for the team at entry once the secretary says so, before any team is made', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const { user } = await renderPage()
      await flushPromises()

      await user.click(screen.getByRole('checkbox', { name: 'teams.askAtEntry' }))
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expectSaved({ teamCompetition: { askAtEntry: true } })
    })

    it('stores no question once it is taken back', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const { user } = await renderPage({
        ...eventWithStations,
        teamCompetition: { askAtEntry: true },
      })
      await flushPromises()

      await user.click(screen.getByRole('checkbox', { name: 'teams.askAtEntry' }))
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expect(putEvent).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ teamCompetition: expect.anything() }),
        TEST_ID_TOKEN,
        undefined,
        undefined
      )
    })

    it('suggests a team from the names given at entry, and makes it the team it suggests', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const { user } = await renderPage({ ...eventWithStations, teamCompetition: { askAtEntry: true } }, namedEntries)
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'teams.takeSuggestion name' }))
      await flushPromises()

      const [team] = teamSections()
      expect(within(team).getByRole('textbox', { name: 'teams.name' })).toHaveValue('Kultaiset')
      expect(members(team)).toEqual(['1A Ensimmainen', '1B Toinen'])
      expect(primaryBox(team)).toBeChecked()
      // The dogs are in a team now, so nothing is left to suggest.
      expect(screen.queryByRole('button', { name: 'teams.takeSuggestion name' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()
      expectSaved({ teams: [{ name: 'Kultaiset', primary: true, registrationIds: ['run-1', 'run-2'] }] })
    })

    it('fills the first empty team with a suggestion before adding one', async () => {
      const { user } = await renderPage(
        { ...eventWithStations, teams: [{ registrationIds: ['reserve-1'] }, { registrationIds: [] }] },
        namedEntries
      )
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'teams.takeSuggestion name' }))
      await flushPromises()

      expect(teamSections()).toHaveLength(2)
      expect(members(teamSections()[1])).toEqual(['2A Ensimmainen', '2B Toinen'])
    })

    it('leaves no first-team mark of its own on the empty team a suggestion without one fills', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const unmarked = [named(registrations[0], 'Kultaiset'), ...registrations.slice(1)]
      const { user } = await renderPage(
        {
          ...eventWithStations,
          teamCompetition: { series: [{ id: 'open', name: { fi: 'Avoin' } }] },
          teams: [{ primary: true, registrationIds: [], seriesId: 'open' }],
        },
        unmarked
      )
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'teams.takeSuggestion name' }))
      await flushPromises()
      expect(primaryBox(teamSections()[0])).not.toBeChecked()

      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()
      expectSaved({ teams: [{ name: 'Kultaiset', registrationIds: ['run-1'], seriesId: 'open' }] })
    })

    // A suggestion is kept whole for the secretary to split; the save would refuse a team too large
    // (`teamErrors`), so the page says why and keeps the save closed until it fits.
    it('says a team made from a suggestion holds too many dogs, and keeps the save closed until it fits', async () => {
      const crowd = Array.from({ length: MAX_TEAM_MEMBERS + 1 }, (_, at) =>
        named({ ...registrations[0], dog: { ...registrations[0].dog, name: `Koira ${at}` }, id: `crowd-${at}` }, 'Iso')
      )
      const { user } = await renderPage(eventWithStations, crowd)
      await flushPromises()

      expect(screen.getByText('teams.suggestionTooMany count')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'teams.takeSuggestion name' }))
      await flushPromises()

      const [team] = teamSections()
      expect(within(team).getByText('teams.tooMany count')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()

      await user.click(within(team).getAllByRole('button', { name: 'teams.remove code' })[0])
      expect(within(team).queryByText('teams.tooMany count')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()
    })

    it('marks a team the first team of its club', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const { user } = await renderPage({ ...eventWithStations, teams: [{ registrationIds: ['run-1'] }] })
      await flushPromises()

      await user.click(primaryBox(teamSections()[0]))
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expectSaved({ teams: [{ primary: true, registrationIds: ['run-1'] }] })
    })

    it('counts a first-team mark alone as a change to save, and stores none once it is cleared', async () => {
      vi.mocked(putEvent).mockResolvedValue(eventWithStations)
      const { user } = await renderPage({
        ...eventWithStations,
        teams: [{ primary: true, registrationIds: ['run-1'] }],
      })
      await flushPromises()
      expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()

      await user.click(primaryBox(teamSections()[0]))
      expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()

      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()
      expectSaved({ teams: [{ registrationIds: ['run-1'] }] })
    })
  })

  it('saves an empty list once the count is back at nought, so a whole-event save clears them too', async () => {
    vi.mocked(putEvent).mockResolvedValue(eventWithStations)
    const { user } = await renderPage({ ...eventWithStations, teams: [{ registrationIds: ['run-1'] }] })
    await flushPromises()

    await setCount(user, '0')
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(putEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ teams: [] }),
      TEST_ID_TOKEN,
      undefined,
      undefined
    )
  })
})
