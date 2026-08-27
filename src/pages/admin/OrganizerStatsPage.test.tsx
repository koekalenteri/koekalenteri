import type { AllYearlyStatsResponse } from '../../api/stats'
import type { TrialStatsEntry } from '../../types/Stats'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { getAllYearlyStats } from '../../api/stats'
import theme from '../../assets/Theme'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises, TEST_ID_TOKEN } from '../../test-utils/utils'
import { ALL_EVENT_TYPES_FOR_CAPACITY, ALL_ORGANIZERS_FOR_TRIALS } from '../../types/Stats'
import { idTokenAtom } from '../state'
import OrganizerStatsPage from './OrganizerStatsPage'

vi.mock('../../api/stats')
vi.mock('../../api/user')
vi.mock('../../api/organizer')

const YEAR = new Date().getFullYear()

// From src/api/__mocks__/organizer.ts: '1' -> 'Järjestäjä 1', '2' -> 'Järjestäjä 2'.
const payload = (trialStats?: TrialStatsEntry[]): AllYearlyStatsResponse => ({
  stats: [
    {
      breedBreakdown: [],
      dogHandlerBuckets: [],
      eventTypeBreakdown: [],
      totals: [],
      trialStats,
      year: YEAR,
    },
  ],
  years: [YEAR],
})

const renderAsAdmin = () =>
  render(
    <ThemeProvider theme={theme}>
      <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
        <MemoryRouter>
          <Suspense fallback={<div>loading...</div>}>
            <OrganizerStatsPage />
          </Suspense>
        </MemoryRouter>
      </Provider>
    </ThemeProvider>
  )

describe('OrganizerStatsPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('redirects to the admin index for a user who is not a site admin', async () => {
    const routes = [
      { element: <OrganizerStatsPage />, path: Path.admin.organizerStats },
      { element: <>Admin Index</>, path: Path.admin.index },
    ]

    render(
      <ThemeProvider theme={theme}>
        <Provider>
          <Suspense fallback={<div>loading...</div>}>
            <DataMemoryRouter initialEntries={[Path.admin.organizerStats]} routes={routes} />
          </Suspense>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(await screen.findByText('Admin Index')).toBeInTheDocument()
  })

  it('renders one row per club + event type, a subtotal per club, and a nationwide grand total', async () => {
    vi.mocked(getAllYearlyStats).mockResolvedValue(
      payload([
        {
          cancelledRegistrations: 3,
          eventCount: 5,
          eventType: 'NOU',
          handlerCount: 40,
          memberStarters: 50,
          organizerId: '2',
          places: 100,
          reserve: 10,
          starters: 90,
        },
        {
          cancelledRegistrations: 3,
          eventCount: 5,
          eventType: ALL_EVENT_TYPES_FOR_CAPACITY,
          handlerCount: 40,
          memberStarters: 50,
          organizerId: '2',
          places: 100,
          reserve: 10,
          starters: 90,
        },
        {
          cancelledRegistrations: 2,
          eventCount: 3,
          eventType: 'NOME-B',
          handlerCount: 15,
          memberStarters: 12,
          organizerId: '1',
          places: 30,
          reserve: 4,
          starters: 20,
        },
        {
          cancelledRegistrations: 2,
          eventCount: 3,
          eventType: ALL_EVENT_TYPES_FOR_CAPACITY,
          handlerCount: 15,
          memberStarters: 12,
          organizerId: '1',
          places: 30,
          reserve: 4,
          starters: 20,
        },
        {
          cancelledRegistrations: 5,
          eventCount: 8,
          eventType: ALL_EVENT_TYPES_FOR_CAPACITY,
          handlerCount: 54,
          memberStarters: 62,
          organizerId: ALL_ORGANIZERS_FOR_TRIALS,
          places: 130,
          reserve: 14,
          starters: 110,
        },
      ])
    )

    renderAsAdmin()
    await flushPromises()

    await screen.findByText('stats.admin.trialStatsTitle')

    const rows = screen.getAllByRole('row')
    // Header + (club 1's event-type row + subtotal) + (club 2's event-type row + subtotal) + grand total footer row.
    expect(rows).toHaveLength(6)

    // Clubs are ordered by name: "Järjestäjä 1" before "Järjestäjä 2".
    const club1Row = screen.getByText('NOME-B').closest('tr')
    expect(club1Row).toHaveTextContent('Järjestäjä 1')
    expect(club1Row).toHaveTextContent('3')
    expect(club1Row).toHaveTextContent('30')
    expect(club1Row).toHaveTextContent('20')
    expect(club1Row).toHaveTextContent('15')
    expect(club1Row).toHaveTextContent('4')
    expect(club1Row).toHaveTextContent('2')
    expect(club1Row).toHaveTextContent('12')

    const club2Row = screen.getByText('NOU').closest('tr')
    expect(club2Row).toHaveTextContent('Järjestäjä 2')
    expect(club2Row).toHaveTextContent('5')
    expect(club2Row).toHaveTextContent('100')
    expect(club2Row).toHaveTextContent('90')
    expect(club2Row).toHaveTextContent('40')
    expect(club2Row).toHaveTextContent('10')
    expect(club2Row).toHaveTextContent('3')
    expect(club2Row).toHaveTextContent('50')

    // Each club's subtotal row repeats its own totals under "Yhteensä" -- only one event type
    // each in this fixture, so the subtotal numbers match the single row above it.
    const subtotalRows = screen.getAllByText('stats.admin.trialStatsTotal')
    expect(subtotalRows).toHaveLength(3) // two club subtotals + the grand total row

    const grandTotalRow = subtotalRows[2].closest('tr')
    expect(grandTotalRow).toHaveTextContent('8')
    expect(grandTotalRow).toHaveTextContent('130')
    expect(grandTotalRow).toHaveTextContent('110')
    expect(grandTotalRow).toHaveTextContent('54')
    expect(grandTotalRow).toHaveTextContent('14')
    expect(grandTotalRow).toHaveTextContent('5')
    expect(grandTotalRow).toHaveTextContent('62')

    // The cross-type/cross-club sentinel values are never shown as literal event types or club names.
    expect(screen.queryByText(ALL_EVENT_TYPES_FOR_CAPACITY)).not.toBeInTheDocument()
    expect(screen.queryByText(ALL_ORGANIZERS_FOR_TRIALS)).not.toBeInTheDocument()
  })

  it('shows the empty state when there is no data for the selected year', async () => {
    vi.mocked(getAllYearlyStats).mockResolvedValue(payload(undefined))

    renderAsAdmin()
    await flushPromises()

    await screen.findByText('stats.noDataForYear')
  })
})
