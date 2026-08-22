import { render } from 'vitest-browser-react'
import CancellationRateChart from './CancellationRateChart'
import { ALL_CLASSES_ID } from './CapacityUtilizationChart'
import { ChartFrame, capacityEntry } from './statsVisualFixtures'

it('plots the cancelled share per month as a percentage', async () => {
  const screen = await render(
    <ChartFrame>
      <CancellationRateChart
        classKey={ALL_CLASSES_ID}
        data={[
          capacityEntry('2025-03', 'ALO', 40, 22, { cancelledRegistrations: 4 }),
          capacityEntry('2025-04', 'ALO', 40, 35, { cancelledRegistrations: 6 }),
          capacityEntry('2025-05', 'ALO', 60, 60, { cancelledRegistrations: 9 }),
          capacityEntry('2025-06', 'ALO', 60, 60, { cancelledRegistrations: 3 }),
          capacityEntry('2025-07', 'ALO', 40, 38, { cancelledRegistrations: 11 }),
        ]}
      />
    </ChartFrame>
  )

  await expect.element(screen.getByText('stats.admin.cancellationRateTitle')).toBeVisible()
  await expect(screen.getByTestId('chart-root')).toMatchScreenshot('cancellation-rate')
})
