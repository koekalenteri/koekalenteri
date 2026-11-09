import type { ConfirmedEvent, Registration } from '@/types'
import { ThemeProvider } from '@mui/material'
import { cleanup, screen, within } from '@testing-library/react'
import { Suspense } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStations, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import { putEvent } from '@/api/event'
import theme from '@/assets/Theme'
import { Path } from '@/routeConfig'
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
            <DataMemoryRouter
              initialEntries={[Path.admin.teams(event.id)]}
              routes={[
                { element: <EventTeamsPage />, path: Path.admin.teams() },
                { element: <div>event view</div>, path: Path.admin.viewEvent() },
              ]}
            />
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
      expect(within(first).queryByRole('checkbox')).not.toBeInTheDocument()
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
