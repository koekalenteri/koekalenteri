import { render } from 'vitest-browser-react'
import CapacityUtilizationChart, { ALL_CLASSES_ID } from './CapacityUtilizationChart'
import { ChartFrame, capacityEntry } from './statsVisualFixtures'

it('sums a class across event types instead of repeating the month on the axis', async () => {
  // Regression: with "all event types" selected the fan-out returns one entry per month *per
  // event type*, and the chart used to plot 2025-06 twice side by side instead of one 30/24 bar.
  const screen = await render(
    <ChartFrame>
      <CapacityUtilizationChart
        classKey="ALO"
        data={[
          capacityEntry('2025-06', 'ALO', 20, 15),
          capacityEntry('2025-06', 'ALO', 10, 9, { eventType: 'NOME-A' }),
          capacityEntry('2025-07', 'ALO', 12, 10),
        ]}
      />
    </ChartFrame>
  )

  await expect.element(screen.getByText('stats.admin.capacityTitle')).toBeVisible()
  await expect(screen.getByTestId('chart-root')).toMatchScreenshot('capacity-one-class-across-event-types')
})

it('sums every class into one series per month', async () => {
  const screen = await render(
    <ChartFrame>
      <CapacityUtilizationChart
        classKey={ALL_CLASSES_ID}
        data={[
          capacityEntry('2025-06', 'ALO', 20, 15),
          capacityEntry('2025-06', 'AVO', 10, 9),
          capacityEntry('2025-07', 'ALO', 12, 10),
          capacityEntry('2025-07', 'AVO', 14, 13),
        ]}
      />
    </ChartFrame>
  )

  await expect(screen.getByTestId('chart-root')).toMatchScreenshot('capacity-all-classes')
})
