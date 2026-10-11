import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material/styles'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../assets/Theme'
import { TestProvider } from '../test-utils/AtomProvider'
import { DataMemoryRouter, TEST_ID_TOKEN } from '../test-utils/utils'
import { Component as StatsPage } from './StatsPage'
import { idTokenAtom } from './state'

// The page picks the current year when its module loads, before any beforeAll could freeze the clock,
// so the clock is frozen ahead of the imports: the year picker would otherwise move every new year.
vi.hoisted(() => vi.useFakeTimers({ now: new Date('2026-10-07T09:00:00Z'), toFake: ['Date'] }))
afterAll(() => vi.useRealTimers())

// The header is the app's, with its own tests; this one is about the page under it.
vi.mock('./components/Header', () => ({ default: () => null }))

// The statistics are for the people running the service. With nothing recorded yet every chart stands
// in its empty state, which leaves the page's outline (the title and one heading per chart) as what
// the capture is about; each chart's drawing has a screenshot of its own.
vi.mock(import('../api/user'), async (importOriginal) => ({
  ...(await importOriginal()),
  getUser: async () => ({ admin: true, email: 'admin@example.com', id: 'admin', name: 'Anni Admin' }),
}))
vi.mock(import('../api/stats'), async (importOriginal) => ({
  ...(await importOriginal()),
  getAllYearlyStats: async () => ({ stats: [], years: [] }),
  getCapacityStats: async () => [],
}))

it('puts each chart under the page heading, one level below it', async () => {
  const routes: RouteObject[] = [{ element: <StatsPage />, path: '/stats' }]
  await page.viewport(1000, 1300)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 1000 }}>
      <ThemeProvider theme={theme}>
        <TestProvider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <Suspense fallback={<div>loading...</div>}>
            <DataMemoryRouter initialEntries={['/stats']} routes={routes} />
          </Suspense>
        </TestProvider>
      </ThemeProvider>
    </div>
  )

  // The statistics are the page's h1 and every chart title an h2 under it (KOE-1506).
  await expect.element(screen.getByRole('heading', { level: 1 })).toBeVisible()
  expect(screen.getByRole('heading', { level: 2 }).elements()).toHaveLength(7)
  expect(screen.getByRole('heading').elements()).toHaveLength(8)
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('stats-page')
})
