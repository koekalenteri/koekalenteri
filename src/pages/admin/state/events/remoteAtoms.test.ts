import type { DogEvent } from '../../../../types'
import { reconcileAdminEvents } from './remoteAtoms'

vi.mock('../../../../api/event', () => ({
  getAdminEvents: vi.fn(),
}))

const event = (id: string, startDate: string, updatedAt: string): DogEvent =>
  ({ id, startDate: new Date(startDate), updatedAt: new Date(updatedAt) }) as DogEvent

describe('reconcileAdminEvents', () => {
  it('merges changed and new events into the cached collection', () => {
    const unchanged = event('unchanged', '2026-02-01', '2026-01-01')
    const stale = event('changed', '2026-03-01', '2026-01-01')
    const changed = event('changed', '2026-04-01', '2026-01-02')
    const added = event('added', '2026-01-01', '2026-01-02')

    expect(reconcileAdminEvents([unchanged, stale], [changed, added])).toEqual([added, unchanged, changed])
  })
})
