import type { CapacityStatsEntry } from '../../../types/Stats'
import { render, screen } from '@testing-library/react'
import CapacityUtilizationChart from './CapacityUtilizationChart'

const entry = (month: string, classKey: string, places: number, starters: number): CapacityStatsEntry => ({
  cancelledRegistrations: 0,
  class: classKey,
  eventCount: 1,
  eventType: 'NOME-B',
  month,
  places,
  reserve: 0,
  starters,
})

describe('CapacityUtilizationChart', () => {
  it('renders starters vs. places for the selected class only', () => {
    render(
      <CapacityUtilizationChart
        classKey="ALO"
        data={[entry('2025-05', 'ALO', 20, 18), entry('2025-06', 'ALO', 20, 15), entry('2025-06', 'AVO', 10, 9)]}
      />
    )

    expect(screen.getByText('stats.admin.capacityTitle')).toBeInTheDocument()
  })

  it('shows a placeholder when there is no data for the selected class', () => {
    render(<CapacityUtilizationChart classKey="VOI" data={[entry('2025-06', 'ALO', 20, 15)]} />)

    expect(screen.getByText('stats.admin.noCapacityData')).toBeInTheDocument()
  })
})
