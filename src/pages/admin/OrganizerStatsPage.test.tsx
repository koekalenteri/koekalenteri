import type { TestStore } from 'test-utils/AtomProvider'
import { ThemeProvider } from '@mui/material'
import { act, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import {
  getAdminCapacityStats,
  getAdminJudgeWorkload,
  getAllYearlyStats,
  getOrganizerEventStats,
} from '../../api/stats'
import theme from '../../assets/Theme'
import { flushPromises, renderSuspended, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import OrganizerStatsPage from './OrganizerStatsPage'
import { adminCapacityStatsEventTypeAtom, adminStatsOrganizerIdAtom } from './state'

vi.mock('../../api/stats')
vi.mock('../../api/organizer')
vi.mock('../../api/user')
// The shared manual mock returns one event type with no `active` flag, which the picker filters
// out; this page needs active ones to have anything to offer.
vi.mock('../../api/eventType', () => ({
  getEventTypes: async () => [
    { active: true, description: { en: 'Field trial', fi: 'Taipumuskoe' }, eventType: 'NOME-B' },
    { active: true, description: { en: 'Hunting test', fi: 'Metsästyskoe' }, eventType: 'NOWT' },
  ],
}))

describe('OrganizerStatsPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    vi.runOnlyPendingTimers()
    localStorage.clear()
  })
  afterAll(() => vi.useRealTimers())

  it('fetches organizer stats once, unfiltered, and filters client-side by the selection', async () => {
    await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminStatsOrganizerIdAtom, '1')
          }}
        >
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <OrganizerStatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    await screen.findByText('stats.admin.overviewTitle')
    // The title carries the filters the chart is drawn for, so it still says what it shows once
    // the pickers have scrolled out of sight.
    // No organizer in it: none of them has any stats, so the picker offers none either.
    expect(screen.getByText(`stats.admin.title – ${new Date().getFullYear()}`)).toBeInTheDocument()
    // No organizerId/date-range args: the whole dataset is fetched once and filtered in memory.
    expect(getOrganizerEventStats).toHaveBeenCalledTimes(1)
    expect(getOrganizerEventStats).toHaveBeenCalledWith(TEST_ID_TOKEN)
  })

  it('does not re-fetch when the organizer filter changes', async () => {
    vi.mocked(getOrganizerEventStats).mockResolvedValue([
      { organizerId: '1', PK: 'ORG#1', SK: '2024-01-01#event' },
      { organizerId: '2', PK: 'ORG#2', SK: '2024-01-01#event' },
    ])

    const { rerender } = await renderSuspended(
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
    await flushPromises()
    await screen.findByText('stats.admin.overviewTitle')
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
              <OrganizerStatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(getOrganizerEventStats).toHaveBeenCalledTimes(1)
  })

  it('fetches the judge workload for the selected organizer and year, and again when the organizer changes', async () => {
    vi.mocked(getOrganizerEventStats).mockResolvedValue([
      { organizerId: '1', PK: 'ORG#1', SK: '2024-01-01#event' },
      { organizerId: '2', PK: 'ORG#2', SK: '2024-01-01#event' },
    ])

    let store: TestStore | undefined
    await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider
          initializeState={(s) => {
            store = s
            s.set(idTokenAtom, TEST_ID_TOKEN)
            s.set(adminStatsOrganizerIdAtom, '1')
          }}
        >
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <OrganizerStatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()
    await screen.findByText('stats.admin.overviewTitle')

    const currentYear = new Date().getFullYear()
    expect(getAdminJudgeWorkload).toHaveBeenCalledWith(TEST_ID_TOKEN, currentYear, '1')

    // The organizer picker is honoured: a new selection fetches that organizer's figures.
    act(() => store?.set(adminStatsOrganizerIdAtom, '2'))
    await flushPromises()

    expect(getAdminJudgeWorkload).toHaveBeenCalledWith(TEST_ID_TOKEN, currentYear, '2')
  })

  it('derives the selectable years from the organizer stats without fetching yearly stats', async () => {
    vi.mocked(getOrganizerEventStats).mockResolvedValue([
      { date: new Date('2022-05-20T21:00:00.000Z'), organizerId: '1', PK: 'ORG#1', SK: '2022-05-21#a' },
      { date: new Date('2024-03-10T22:00:00.000Z'), organizerId: '1', PK: 'ORG#1', SK: '2024-03-11#b' },
    ])

    await renderSuspended(
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
    await flushPromises()
    await screen.findByText('stats.admin.overviewTitle')

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

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminStatsOrganizerIdAtom, '2')
          }}
        >
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <OrganizerStatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    await screen.findByDisplayValue('Järjestäjä 1')
  })

  it('builds the class filter from the fetched capacity stats and renders the capacity charts', async () => {
    vi.mocked(getAdminCapacityStats).mockResolvedValue([
      {
        cancelledRegistrations: 2,
        class: 'AVO',
        eventCount: 1,
        eventType: 'NOME-B',
        month: '2025-06',
        organizerId: '1',
        places: 20,
        reserve: 3,
        starters: 18,
      },
      {
        cancelledRegistrations: 1,
        class: 'ALO',
        eventCount: 1,
        eventType: 'NOME-B',
        month: '2025-06',
        organizerId: '1',
        places: 10,
        reserve: 0,
        starters: 9,
      },
    ])

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminCapacityStatsEventTypeAtom, 'NOME-B')
          }}
        >
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <OrganizerStatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    await screen.findByText('stats.admin.overviewTitle')
    // All three capacity charts hang off the same fetched data, and each names the event type and
    // class it was drawn for, after the organizer the page settled on.
    expect(screen.getByText('stats.admin.capacityTitle – Järjestäjä 1 – NOME-B – ALO')).toBeInTheDocument()
    expect(screen.getByText('stats.admin.demandTitle – Järjestäjä 1 – NOME-B – ALO')).toBeInTheDocument()
    expect(screen.getByText('stats.admin.cancellationRateTitle – Järjestäjä 1 – NOME-B – ALO')).toBeInTheDocument()
    // Classes come from the data, sorted, and the selection falls back to the first one.
    expect(screen.getByDisplayValue('ALO')).toBeInTheDocument()
  })
})
