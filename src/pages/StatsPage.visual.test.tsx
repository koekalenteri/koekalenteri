import type { RouteObject } from 'react-router'
import type { AllYearlyStatsResponse, YearlyStatsResponse } from '../api/stats'
import type { RetentionStats } from '../types/Stats'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../assets/Theme'
import { TestProvider } from '../test-utils/AtomProvider'
import { DataMemoryRouter, TEST_ID_TOKEN } from '../test-utils/utils'
import { Component as StatsPage } from './StatsPage'
import { idTokenAtom } from './state'

// The page's default year is this year, read when it renders; the clock is frozen ahead of the imports so
// the fixtures and the page agree on what that is.
await vi.hoisted(async () => {
  const { freezeClockNow } = await import('../test-utils/freezeClock')
  freezeClockNow('2026-10-07')
})

// The header is the app's, with its own tests; this one is about the page under it.
vi.mock('./components/Header', () => ({ default: () => null }))

const year = (
  value: number,
  dogs: number,
  handlers: number,
  retention?: Omit<RetentionStats, 'year'>
): YearlyStatsResponse => ({
  dogHandlerBuckets: [],
  totals: [
    { count: dogs, type: 'dog', year: value },
    { count: handlers, type: 'handler', year: value },
  ],
  year: value,
  ...(retention && { retention: { ...retention, year: value } }),
})

// Two past years: enough for the participation trend and the retention chart to draw, the only two
// charts that are left out altogether without data. The current year has nothing yet, so its charts
// stand in their empty state, which still carries each chart's heading.
const stats: AllYearlyStatsResponse = {
  stats: [year(2024, 300, 240), year(2025, 340, 260, { new: 110, returning: 230 })],
  years: [2024, 2025],
}

// The statistics are for the people running the service.
vi.mock(import('../api/user'), async (importOriginal) => ({
  ...(await importOriginal()),
  getUser: async () => ({ admin: true, email: 'admin@example.com', id: 'admin', name: 'Anni Admin' }),
}))
vi.mock(import('../api/stats'), async (importOriginal) => ({
  ...(await importOriginal()),
  getAllYearlyStats: async () => stats,
  getCapacityStats: async () => [],
}))

it('puts each chart under the page heading, one level below it', async () => {
  const routes: RouteObject[] = [{ element: <StatsPage />, path: '/stats' }]
  await page.viewport(1000, 2000)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 1000 }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
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
  expect(screen.getByRole('heading', { level: 2 }).elements()).toHaveLength(9)
  expect(screen.getByRole('heading').elements()).toHaveLength(10)
  // The frozen day decides the year picked; the data's own years are the two before it.
  await expect.element(screen.getByRole('button', { name: '2026', pressed: true })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('stats-page')
})
