import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { getAllYearlyStats, getOrganizerEventStats } from '../../api/stats'
import theme from '../../assets/Theme'
import { flushPromises, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import StatsPage from './StatsPage'
import { adminStatsOrganizerIdAtom } from './state'

vi.mock('../../api/stats')
vi.mock('../../api/organizer')
vi.mock('../../api/user')
vi.mock('../../api/eventType')

describe('admin StatsPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    vi.runOnlyPendingTimers()
    localStorage.clear()
  })
  afterAll(() => vi.useRealTimers())

  it('fetches organizer stats once, unfiltered, and filters client-side by the selection', async () => {
    render(
      <ThemeProvider theme={theme}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminStatsOrganizerIdAtom, '1')
          }}
        >
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <StatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    await screen.findByText('stats.title')
    expect(screen.getByText('stats.admin.title')).toBeInTheDocument()
    // No organizerId/date-range args: the whole dataset is fetched once and filtered in memory.
    expect(getOrganizerEventStats).toHaveBeenCalledTimes(1)
    expect(getOrganizerEventStats).toHaveBeenCalledWith(TEST_ID_TOKEN)
  })

  it('does not re-fetch when the organizer filter changes', async () => {
    vi.mocked(getOrganizerEventStats).mockResolvedValue([
      { organizerId: '1', PK: 'ORG#1', SK: '2024-01-01#event' },
      { organizerId: '2', PK: 'ORG#2', SK: '2024-01-01#event' },
    ])

    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <StatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()
    await screen.findByText('stats.title')
    expect(getOrganizerEventStats).toHaveBeenCalledTimes(1)

    // Changing the selected organizer re-renders but must not trigger another network call.
    rerender(
      <ThemeProvider theme={theme}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminStatsOrganizerIdAtom, '2')
          }}
        >
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <StatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(getOrganizerEventStats).toHaveBeenCalledTimes(1)
  })

  it('derives the selectable years from the organizer stats without fetching yearly stats', async () => {
    vi.mocked(getOrganizerEventStats).mockResolvedValue([
      { date: new Date('2022-05-20T21:00:00.000Z'), organizerId: '1', PK: 'ORG#1', SK: '2022-05-21#a' },
      { date: new Date('2024-03-10T22:00:00.000Z'), organizerId: '1', PK: 'ORG#1', SK: '2024-03-11#b' },
    ])

    render(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <StatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()
    await screen.findByText('stats.title')

    // The years come from the stats already in memory; /stats is never called for them.
    expect(getAllYearlyStats).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '2022' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2024' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${new Date().getFullYear()}` })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '2023' })).not.toBeInTheDocument()
  })

  it('excludes organizations without any recorded stats from the filter, correcting a stale selection', async () => {
    // Only organizer '1' has any recorded stats; '2' exists (see api/__mocks__/organizer) but has none,
    // so it must be excluded from the filter and the selection corrected to the only valid choice.
    vi.mocked(getOrganizerEventStats).mockResolvedValue([{ organizerId: '1', PK: 'ORG#1', SK: '2024-01-01#event' }])

    render(
      <ThemeProvider theme={theme}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminStatsOrganizerIdAtom, '2')
          }}
        >
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <StatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    await screen.findByDisplayValue('Järjestäjä 1')
  })
})
