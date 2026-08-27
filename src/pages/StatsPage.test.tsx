import type { AllYearlyStatsResponse } from '../api/stats'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { getAllYearlyStats } from '../api/stats'
import theme from '../assets/Theme'
import { flushPromises, TEST_ID_TOKEN } from '../test-utils/utils'
import { Component as StatsPage } from './StatsPage'
import { idTokenAtom } from './state'

vi.mock('./components/Header', () => ({ default: () => <>header</> }))
vi.mock('../api/stats')
vi.mock('../api/user')

describe('StatsPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('renders yearly stats once loaded', async () => {
    render(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter initialEntries={['/tilastot']}>
            <Suspense fallback={<div>loading...</div>}>
              <StatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    await screen.findByText('stats.title', { exact: false })
  })

  it('takes the selected year out of the all-years payload instead of re-requesting it', async () => {
    render(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter initialEntries={['/tilastot?year=2024']}>
            <Suspense fallback={<div>loading...</div>}>
              <StatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()
    await screen.findByText('stats.title', { exact: false })

    // The all-years response already contains 2024's breakdowns; one request covers the page.
    expect(getAllYearlyStats).toHaveBeenCalledTimes(1)
  })

  const renderPage = () =>
    render(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter initialEntries={['/tilastot']}>
            <Suspense fallback={<div>loading...</div>}>
              <StatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )

  const payload = (retention?: { new: number; returning: number }): AllYearlyStatsResponse => ({
    stats: [
      { breedBreakdown: [], dogHandlerBuckets: [], eventTypeBreakdown: [], totals: [], year: 2024 },
      {
        breedBreakdown: [],
        dogHandlerBuckets: [],
        eventTypeBreakdown: [],
        totals: [],
        year: 2025,
        ...(retention && { retention: { ...retention, year: 2025 } }),
      },
    ],
    years: [2024, 2025],
  })

  it('shows the retention chart once any year has a retention record', async () => {
    vi.mocked(getAllYearlyStats).mockResolvedValue(payload({ new: 40, returning: 160 }))

    renderPage()
    await flushPromises()

    await screen.findByText('stats.retentionTitle')
  })

  it('hides the retention chart until a rebuild has written the records', async () => {
    // The state right after deploy: RETENTION# rows do not exist yet, and an empty chart would
    // be worse than none.
    vi.mocked(getAllYearlyStats).mockResolvedValue(payload())

    renderPage()
    await flushPromises()

    await screen.findByText('stats.title', { exact: false })
    expect(screen.queryByText('stats.retentionTitle')).not.toBeInTheDocument()
  })
})
