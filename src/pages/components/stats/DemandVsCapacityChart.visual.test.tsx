import type { CapacityStatsEntry } from '../../../types/Stats'
import { render } from 'vitest-browser-react'
import { ALL_CLASSES_ID } from './CapacityUtilizationChart'
import DemandVsCapacityChart from './DemandVsCapacityChart'

const month = (
  month: string,
  places: number,
  starters: number,
  reserve: number,
  cancelledRegistrations = 0
): CapacityStatsEntry => ({
  cancelledRegistrations,
  class: 'ALO',
  eventCount: 2,
  eventType: 'NOME-B',
  month,
  organizerId: 'org1',
  places,
  reserve,
  starters,
})

// Months that swing from spare capacity to a waiting list and back, so the places line has to
// cross the bars in both directions -- the one thing this chart exists to show.
const data = [
  month('2025-03', 40, 22, 0, 4),
  month('2025-04', 40, 35, 0, 6),
  month('2025-05', 60, 60, 14, 9),
  month('2025-06', 60, 60, 26, 3),
  month('2025-07', 40, 38, 5, 11),
  month('2025-08', 40, 18, 0, 2),
]

it('draws the waiting list above the places line only where demand exceeded capacity', async () => {
  const screen = await render(
    <div data-testid="chart-root" style={{ background: '#fff', padding: 16, width: 1000 }}>
      <DemandVsCapacityChart classKey={ALL_CLASSES_ID} data={data} />
    </div>
  )

  await expect.element(screen.getByText('stats.admin.demandTitle')).toBeVisible()
  await expect(screen.getByTestId('chart-root')).toMatchScreenshot('demand-vs-capacity')
})
