import type { AllYearlyStatsResponse } from '../api/stats'
import { ThemeProvider } from '@mui/material'
import { screen } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { MOCK_NO_ROLE_USER } from '../api/__mocks__/user'
import { getAllYearlyStats } from '../api/stats'
import { getUser } from '../api/user'
import theme from '../assets/Theme'
import { flushPromises, renderSuspended, TEST_ID_TOKEN } from '../test-utils/utils'
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
    await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter initialEntries={['/stats']}>
            <Suspense fallback={<div>loading...</div>}>
              <StatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(await screen.findByText('stats.title', { exact: false })).toBeInTheDocument()
  })

  it('takes the selected year out of the all-years payload instead of re-requesting it', async () => {
    await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter initialEntries={['/stats?year=2024']}>
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
    renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter initialEntries={['/stats']}>
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

    await renderPage()
    await flushPromises()

    expect(await screen.findByText('stats.retentionTitle')).toBeInTheDocument()
  })

  it('hides the retention chart until a rebuild has written the records', async () => {
    // The state right after deploy: RETENTION# rows do not exist yet, and an empty chart would
    // be worse than none.
    vi.mocked(getAllYearlyStats).mockResolvedValue(payload())

    await renderPage()
    await flushPromises()

    await screen.findByText('stats.title', { exact: false })
    expect(screen.queryByText('stats.retentionTitle')).not.toBeInTheDocument()
  })

  // A signed-in user without a role was sent to /login, which only sent them back (KOE-1734).
  it('tells a signed-in user without a role that they have no rights', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(MOCK_NO_ROLE_USER)

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter initialEntries={['/stats']}>
            <Suspense fallback={<div>loading...</div>}>
              <Routes>
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/login" element={<>Login</>} />
              </Routes>
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(screen.queryByText('Login')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'error.noAdminAccess' })).toBeInTheDocument()
    expect(screen.queryByText('stats.title', { exact: false })).not.toBeInTheDocument()
  })
})
