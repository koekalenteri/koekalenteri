import type { YearlyStatsResponse } from '../../../api/stats'
import { render } from 'vitest-browser-react'
import RetentionChart from './RetentionChart'
import { ChartFrame } from './statsVisualFixtures'

const year = (year: number, retention?: { new: number; returning: number }): YearlyStatsResponse => ({
  breedBreakdown: [],
  dogHandlerBuckets: [],
  totals: [],
  year,
  ...(retention && { retention: { ...retention, year } }),
})

it('stacks returning and new pairs, skipping the year that has nothing to compare against', async () => {
  // 2021 carries no retention record; drawing it would show every pair as new and overstate
  // newcomers exactly once, at the left edge.
  const screen = await render(
    <ChartFrame>
      <RetentionChart
        stats={[
          year(2021),
          year(2022, { new: 120, returning: 180 }),
          year(2023, { new: 90, returning: 240 }),
          year(2024, { new: 140, returning: 260 }),
          year(2025, { new: 110, returning: 320 }),
        ]}
      />
    </ChartFrame>
  )

  await expect.element(screen.getByText('stats.retentionTitle')).toBeVisible()
  await expect(screen.getByTestId('chart-root')).toMatchScreenshot('retention')
})

it('shows a placeholder when no year has retention data yet', async () => {
  const screen = await render(
    <ChartFrame>
      <RetentionChart stats={[year(2021)]} />
    </ChartFrame>
  )

  await expect.element(screen.getByText('stats.noDataForYear')).toBeVisible()
})
