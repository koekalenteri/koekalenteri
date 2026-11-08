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
const registrations = [...registrationsToEventWithStations, cancelled]

const renderPage = (event: ConfirmedEvent = eventWithStations) =>
  renderSuspendedWithUserEvents(
    <ThemeProvider theme={theme}>
      <Provider
        initializeState={({ set }) => {
          set(idTokenAtom, TEST_ID_TOKEN)
          set(adminEventsAtom, [event])
          set(adminEventRegistrationsAtom(event.id), registrations)
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
