import { render } from 'vitest-browser-react'
import BreedDistributionChart from './BreedDistributionChart'
import { ChartFrame, yearEntry } from './statsVisualFixtures'

const BREEDS = ['LAB', 'GOL', 'NSD', 'FCR', 'CHE', 'SPS', 'WEI', 'VIZ', 'BRT', 'CKS']
const years = [2021, 2022, 2023, 2024, 2025]

const stats = years.map((year, yi) =>
  yearEntry(
    year,
    BREEDS.map((entityId, bi) => ({
      count: Math.max(2, Math.round(420 / (bi + 1.4) + yi * 30 - bi * 6 + (bi % 3) * 12)),
      entityId,
    }))
  )
)

it('stacks the top breeds per year with the remainder on top', async () => {
  // Also pins the label ink: several palette slots are too light for dark text and several too
  // dark for white, so each segment's number takes the colour its own fill can support.
  const screen = await render(
    <ChartFrame>
      <BreedDistributionChart stats={stats} />
    </ChartFrame>
  )

  await expect.element(screen.getByText('stats.breedDistribution')).toBeVisible()
  await expect(screen.getByTestId('chart-root')).toMatchScreenshot('breed-distribution')
})
