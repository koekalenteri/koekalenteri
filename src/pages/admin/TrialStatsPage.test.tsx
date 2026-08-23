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
import { ALL_EVENT_TYPES_FOR_CAPACITY } from '../../types/Stats'
import { idTokenAtom } from '../state'
import TrialStatsPage from './TrialStatsPage'

vi.mock('../../api/stats')
vi.mock('../../api/user')

const YEAR = new Date().getFullYear()

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
            <TrialStatsPage />
          </Suspense>
        </MemoryRouter>
      </Provider>
    </ThemeProvider>
  )

describe('TrialStatsPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('redirects to the admin index for a user who is not a site admin', async () => {
    const routes = [
      { element: <TrialStatsPage />, path: Path.admin.trialStats },
      { element: <>Admin Index</>, path: Path.admin.index },
    ]

    render(
      <ThemeProvider theme={theme}>
        <Provider>
          <Suspense fallback={<div>loading...</div>}>
            <DataMemoryRouter initialEntries={[Path.admin.trialStats]} routes={routes} />
          </Suspense>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(await screen.findByText('Admin Index')).toBeInTheDocument()
  })

  it('renders trials, places, starts and handlers per event type for the selected year', async () => {
    vi.mocked(getAllYearlyStats).mockResolvedValue(
      payload([
        { eventCount: 5, eventType: 'NOU', handlerCount: 40, places: 100, starters: 90 },
        { eventCount: 8, eventType: ALL_EVENT_TYPES_FOR_CAPACITY, handlerCount: 60, places: 200, starters: 180 },
      ])
    )

    renderAsAdmin()
    await flushPromises()

    await screen.findByText('stats.admin.trialStatsTitle')

    const eventTypeRow = screen.getByText('NOU').closest('tr')
    expect(eventTypeRow).toHaveTextContent('NOU')
    expect(eventTypeRow).toHaveTextContent('5')
    expect(eventTypeRow).toHaveTextContent('100')
    expect(eventTypeRow).toHaveTextContent('90')
    expect(eventTypeRow).toHaveTextContent('40')

    const totalRow = screen.getByText('stats.admin.trialStatsTotal').closest('tr')
    expect(totalRow).toHaveTextContent('8')
    expect(totalRow).toHaveTextContent('200')
    expect(totalRow).toHaveTextContent('180')
    expect(totalRow).toHaveTextContent('60')

    // The cross-type total row itself is not repeated as a per-event-type row.
    expect(screen.queryByText(ALL_EVENT_TYPES_FOR_CAPACITY)).not.toBeInTheDocument()
  })

  it('shows the empty state when there is no data for the selected year', async () => {
    vi.mocked(getAllYearlyStats).mockResolvedValue(payload(undefined))

    renderAsAdmin()
    await flushPromises()

    await screen.findByText('stats.noDataForYear')
  })
})
