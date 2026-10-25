import type { AllYearlyStatsResponse } from '../../api/stats'
import type { EventBreakdownEntry, EventClassStatsRow } from '../../types/Stats'
import { ThemeProvider } from '@mui/material'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { getAllYearlyStats, getEventClassStats } from '../../api/stats'
import theme from '../../assets/Theme'
import { downloadXlsx } from '../../lib/client/xlsx'
import { Path } from '../../routeConfig'
import { frozenInstant } from '../../test-utils/freezeClock'
import { DataMemoryRouter, flushPromises, renderSuspended, TEST_ID_TOKEN } from '../../test-utils/utils'
import { ALL_EVENT_TYPES_FOR_CAPACITY, ALL_ORGANIZERS_FOR_EVENTS } from '../../types/Stats'
import { idTokenAtom } from '../state'
import EventBreakdownPage from './EventBreakdownPage'

vi.mock('../../api/stats')
vi.mock('../../api/user')
vi.mock('../../api/organizer')
vi.mock('../../lib/client/xlsx', () => ({ downloadXlsx: vi.fn().mockResolvedValue(undefined) }))

// A year the real clock is not in, so a page that read the year when its module loads would fail.
const FROZEN = frozenInstant('2025-05-12')

const YEAR = 2025

// From src/api/__mocks__/organizer.ts: '1' -> 'Järjestäjä 1', '2' -> 'Järjestäjä 2'.
const payload = (eventBreakdown?: EventBreakdownEntry[]): AllYearlyStatsResponse => ({
  stats: [
    {
      breedBreakdown: [],
      dogHandlerBuckets: [],
      eventBreakdown,
      eventTypeBreakdown: [],
      totals: [],
      year: YEAR,
    },
  ],
  years: [YEAR],
})

const renderAsAdmin = () =>
  renderSuspended(
    <ThemeProvider theme={theme}>
      <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
        <MemoryRouter>
          <Suspense fallback={<div>loading...</div>}>
            <EventBreakdownPage />
          </Suspense>
        </MemoryRouter>
      </Provider>
    </ThemeProvider>
  )

describe('EventBreakdownPage', () => {
  beforeAll(() => vi.useFakeTimers({ now: FROZEN }))
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('redirects to the admin index for a user who is not a site admin', async () => {
    const routes = [
      { element: <EventBreakdownPage />, path: Path.admin.eventBreakdown },
      { element: <>Admin Index</>, path: Path.admin.index },
    ]

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider>
          <Suspense fallback={<div>loading...</div>}>
            <DataMemoryRouter initialEntries={[Path.admin.eventBreakdown]} routes={routes} />
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
          organizerId: ALL_ORGANIZERS_FOR_EVENTS,
          places: 130,
          reserve: 14,
          starters: 110,
        },
      ])
    )

    await renderAsAdmin()
    await flushPromises()

    await screen.findByText('stats.admin.eventBreakdownTitle')

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
    const subtotalRows = screen.getAllByText('stats.admin.eventBreakdownTotal')
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
    expect(screen.queryByText(ALL_ORGANIZERS_FOR_EVENTS)).not.toBeInTheDocument()
  })

  it('shows the empty state when there is no data for the selected year', async () => {
    vi.mocked(getAllYearlyStats).mockResolvedValue(payload(undefined))

    await renderAsAdmin()
    await flushPromises()

    expect(await screen.findByText('stats.noDataForYear')).toBeInTheDocument()
  })

  it("downloads the selected season's trials class by class (KOE-1595)", async () => {
    vi.mocked(getAllYearlyStats).mockResolvedValue(payload(undefined))
    const row: EventClassStatsRow = {
      cancelled: 1,
      class: 'ALO',
      cost: 50,
      costMember: 40,
      days: ['2025-06-01', '2025-06-02'],
      endDate: '2025-06-02',
      entries: 12,
      entryEndDate: '2025-05-15',
      entryStartDate: '2025-05-01',
      eventType: 'NOME-B',
      location: 'Somewhere',
      organizerId: '1',
      paidAmount: 550,
      pickedFromReserve: 2,
      places: 10,
      priority: ['member'],
      priorityEntries: 4,
      refundedAmount: 45,
      startDate: '2025-06-01',
      state: 'completed',
    }
    vi.mocked(getEventClassStats).mockResolvedValueOnce([row])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    await renderAsAdmin()
    await flushPromises()
    await user.click(await screen.findByRole('button', { name: 'stats.admin.eventClassStatsExport' }))
    await flushPromises()

    expect(getEventClassStats).toHaveBeenCalledWith(TEST_ID_TOKEN, YEAR)
    expect(downloadXlsx).toHaveBeenCalledWith({
      fileName: 'kokeet-luokittain-2025.xlsx',
      rows: [
        expect.arrayContaining(['stats.admin.eventClassStatsPickedFromReserve']),
        [
          'Järjestäjä 1',
          'Somewhere',
          '2025-06-01',
          '2025-06-02',
          'NOME-B',
          'event.states.completed',
          '2025-05-01',
          '2025-05-15',
          'priority.members',
          50,
          40,
          'ALO',
          '2025-06-01, 2025-06-02',
          10,
          12,
          1,
          4,
          2,
          550,
          45,
        ],
      ],
      sheetName: 'stats.admin.eventClassStatsSheet',
    })
  })
})
