import type { ConfirmedEvent, Registration } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
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

const [base] = registrationsToEventWithStations

/** An entry of the trial: a dog, its handler and where it runs. */
const entry = (id: string, dog: string, handler: string, overrides: Partial<Registration> = {}): Registration => ({
  ...base,
  dog: { ...base.dog, name: dog },
  group: { date: RESULTS_EVENT_DAY, key: 'ALO-AP', number: 1, time: 'ap' },
  handler: { ...base.handler, name: handler },
  id,
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

const renderPage = () =>
  render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 900 }}>
      <ThemeProvider theme={theme}>
        <TestProvider
          initializeState={({ set }) => {
            set(adminEventsAtom, [event])
            set(adminEventRegistrationsAtom(event.id), registrations)
          }}
        >
          <AppSnackbarProvider>
            <Suspense fallback={<div>loading...</div>}>
              <DataMemoryRouter
                initialEntries={[Path.admin.teams(event.id)]}
                routes={[{ element: <EventTeamsPage />, path: Path.admin.teams() }]}
              />
            </Suspense>
          </AppSnackbarProvider>
        </TestProvider>
      </ThemeProvider>
    </div>
  )

it('lists the teams with their dogs by code, a cancelled and a reserve dog marked (KOE-1714)', async () => {
  await page.viewport(900, 1300)
  const screen = await renderPage()

  await expect.element(screen.getByText('1C Rantasuon Ruska')).toBeVisible()
  await expect.element(screen.getByRole('heading', { name: 'Joukkue 3' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams')
})

describeInLanguage('en', () => {
  it('lists the teams with their dogs by code, a cancelled and a reserve dog marked (KOE-1714)', async () => {
    await page.viewport(900, 1300)
    const screen = await renderPage()

    await expect.element(screen.getByText('1C Rantasuon Ruska')).toBeVisible()
    await expect.element(screen.getByRole('heading', { name: 'Team 3' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('teams-en')
  })
})
