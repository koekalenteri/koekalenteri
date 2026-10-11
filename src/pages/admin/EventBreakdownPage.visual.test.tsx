import type { AllYearlyStatsResponse } from '../../api/stats'
import type { EventBreakdownEntry } from '../../types/Stats'
import { ThemeProvider } from '@mui/material/styles'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { TestProvider } from '../../test-utils/AtomProvider'
import { TEST_ID_TOKEN } from '../../test-utils/utils'
import { ALL_EVENT_TYPES_FOR_CAPACITY, ALL_ORGANIZERS_FOR_EVENTS } from '../../types/Stats'
import { idTokenAtom } from '../state'
import EventBreakdownPage from './EventBreakdownPage'

// The page reads the year when its module loads; see freezeClockAt for why the clock is frozen here,
// ahead of the imports.
vi.hoisted(() => vi.useFakeTimers({ now: new Date('2026-10-07T09:00:00Z'), toFake: ['Date'] }))
afterAll(() => vi.useRealTimers())

const YEAR = 2026

const row = (organizerId: string, eventType: string, eventCount: number, places: number): EventBreakdownEntry => ({
  cancelledRegistrations: eventCount,
  eventCount,
  eventType,
  handlerCount: places - 10,
  memberStarters: places - 20,
  organizerId,
  places,
  reserve: 2 * eventCount,
  starters: places - 5,
})

const stats: AllYearlyStatsResponse = {
  stats: [
    {
      breedBreakdown: [],
      dogHandlerBuckets: [],
      eventBreakdown: [
        row('1', 'NOME-B', 3, 30),
        row('1', ALL_EVENT_TYPES_FOR_CAPACITY, 3, 30),
        row('2', 'NOU', 5, 100),
        row('2', ALL_EVENT_TYPES_FOR_CAPACITY, 5, 100),
        row(ALL_ORGANIZERS_FOR_EVENTS, ALL_EVENT_TYPES_FOR_CAPACITY, 8, 130),
      ],
      eventTypeBreakdown: [],
      totals: [],
      year: YEAR,
    },
  ],
  years: [YEAR],
}

// The breakdown is a site admin's.
vi.mock(import('../../api/user'), async (importOriginal) => ({
  ...(await importOriginal()),
  getUser: async () => ({ admin: true, email: 'admin@example.com', id: 'admin', name: 'Anni Admin' }),
}))
vi.mock(import('../../api/stats'), async (importOriginal) => ({
  ...(await importOriginal()),
  getAllYearlyStats: async () => stats,
}))
vi.mock(import('../../api/organizer'), async (importOriginal) => ({
  ...(await importOriginal()),
  getAdminOrganizers: async () => [
    { id: '1', name: 'Auran Nuuskut ry' },
    { id: '2', name: 'Hämeen Noutajat ry' },
  ],
}))

it('tabulates the year per club and event type under the page heading', async () => {
  await page.viewport(1000, 520)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 1000 }}>
      <ThemeProvider theme={theme}>
        <TestProvider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <EventBreakdownPage />
            </Suspense>
          </MemoryRouter>
        </TestProvider>
      </ThemeProvider>
    </div>
  )

  // An admin page of its own: the title is its one heading, the table needs none (KOE-1506).
  await expect.element(screen.getByText('Hämeen Noutajat ry').first()).toBeVisible()
  await expect.element(screen.getByRole('heading', { level: 1 })).toBeVisible()
  expect(screen.getByRole('heading').elements()).toHaveLength(1)
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-breakdown-page')
})
