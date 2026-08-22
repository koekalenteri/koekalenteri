import type { YearlyStatsResponse } from '../../../api/stats'
import type { CapacityStatsEntry } from '../../../types/Stats'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
export const ChartFrame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="chart-root" style={{ background: '#fff', padding: 16, width: 1000 }}>
    {children}
  </div>
)

export const capacityEntry = (
  month: string,
  classKey: string,
  places: number,
  starters: number,
  extra: Partial<CapacityStatsEntry> = {}
): CapacityStatsEntry => ({
  cancelledRegistrations: 0,
  class: classKey,
  eventCount: 2,
  eventType: 'NOME-B',
  month,
  organizerId: 'org1',
  places,
  reserve: 0,
  starters,
  ...extra,
})

export const yearEntry = (
  year: number,
  breedBreakdown: { count: number; entityId: string }[]
): YearlyStatsResponse => ({
  breedBreakdown,
  dogHandlerBuckets: [],
  totals: [],
  year,
})
