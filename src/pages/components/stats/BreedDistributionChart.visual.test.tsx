import { render } from 'vitest-browser-react'
import BreedDistributionChart from './BreedDistributionChart'
import { ChartFrame, yearEntry } from './statsVisualFixtures'

// Real FCI breed codes, in the order the retriever trials actually see them: labrador,
// golden, flat-coated, nova scotia, curly-coated, chesapeake, plus mixed/unregistered.
// Fake three-letter codes would render as three-letter labels and hide what the legend does
// with "chesapeakelahdennoutaja".
const BREEDS = ['122', '111', '121', '312', '110', '263', '0']
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

  await expect.element(screen.getByText('Rotujakauma')).toBeVisible()
  await expect(screen.getByTestId('chart-root')).toMatchScreenshot('breed-distribution')
})

it('decodes the charted abbreviations in the info text', async () => {
  const screen = await render(
    <ChartFrame>
      <BreedDistributionChart stats={stats} />
    </ChartFrame>
  )

  const info = screen.getByRole('button', { name: /Lyhenteet:/ })
  await expect.element(info).toBeVisible()
  const label = info.element().getAttribute('aria-label') ?? ''
  expect(label).toContain('lb = labradorinnoutaja')
  expect(label).toContain('ch = chesapeakelahdennoutaja')
  // The mixed/unregistered bucket has no abbreviation: it is charted under its full name, so
  // the legend has nothing to decode for it.
  expect(label).not.toContain('monirotuinen')
})
