import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { TestProvider } from '../../test-utils/AtomProvider'
import { TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import OrganizerStatsPage from './OrganizerStatsPage'
import { ALL_EVENT_TYPES_ID, adminCapacityStatsEventTypeAtom } from './state'

// The page and its year atom read the year when their modules load; see freezeClockNow for why the
// clock is frozen here, ahead of the imports.
await vi.hoisted(async () => {
  const { freezeClockNow } = await import('../../test-utils/freezeClock')
  freezeClockNow('2026-10-07')
})

// The capacity pick is kept in local storage.
afterAll(() => localStorage.clear())

// A site admin with nothing recorded yet: every chart stands in its empty state, which leaves the
// page's outline (the title and one heading per chart) as what the capture is about.
vi.mock(import('../../api/user'), async (importOriginal) => ({
  ...(await importOriginal()),
  getUser: async () => ({ admin: true, email: 'admin@example.com', id: 'admin', name: 'Anni Admin' }),
}))
vi.mock(import('../../api/stats'), async (importOriginal) => ({
  ...(await importOriginal()),
  getAdminCapacityStats: async () => [],
  getAdminJudgeWorkload: async () => [],
  getOrganizerEventStats: async () => [],
}))
vi.mock(import('../../api/organizer'), async (importOriginal) => ({
  ...(await importOriginal()),
  getAdminOrganizers: async () => [],
}))
vi.mock(import('../../api/eventType'), async (importOriginal) => ({
  ...(await importOriginal()),
  getEventTypes: async () => [],
}))

it('puts each chart under the page heading, one level below it', async () => {
  await page.viewport(1000, 1300)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 1000 }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <TestProvider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            // The capacity charts show only once an event type is picked.
            set(adminCapacityStatsEventTypeAtom, ALL_EVENT_TYPES_ID)
          }}
        >
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <OrganizerStatsPage />
            </Suspense>
          </MemoryRouter>
        </TestProvider>
      </ThemeProvider>
    </div>
  )

  // The overview is the page's h1 and every chart title an h2 under it (KOE-1506).
  await expect.element(screen.getByRole('heading', { level: 1 })).toBeVisible()
  await expect.element(screen.getByRole('heading', { level: 2 }).nth(6)).toBeVisible()
  expect(screen.getByRole('heading', { level: 2 }).elements()).toHaveLength(7)
  expect(screen.getByRole('heading').elements()).toHaveLength(8)
  // The frozen day decides the year picked.
  await expect.element(screen.getByRole('button', { name: '2026', pressed: true })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('organizer-stats-page')
})
