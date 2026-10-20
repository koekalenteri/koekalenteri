import type { DayKey } from '@/types'
import useEventListColumns, { compareByStartDayLatestFirst } from './columns'

vi.mock('../state/judges/actions', () => ({
  useJudgesActions: () => ({
    find: (id: number) => ({ id, name: `Judge ${id}` }),
  }),
}))

describe('useEventListColumns', () => {
  it('should match snapshot', () => {
    expect(useEventListColumns()).toMatchSnapshot()
  })

  // The day keys sort as text (KOE-1547): the latest trial first, and a start day decides alone.
  it('sorts the date column by start day, the latest first', () => {
    const compare = (a: DayKey, b: DayKey) => compareByStartDayLatestFirst({ end: a, start: a }, { end: b, start: b })

    expect(compare('2026-06-01', '2026-06-02')).toBeGreaterThan(0)
    expect(compare('2026-06-02', '2026-06-01')).toBeLessThan(0)
    expect(compare('2026-06-01', '2026-06-01')).toBe(0)
    expect(compare('2025-12-31', '2026-01-01')).toBeGreaterThan(0)
  })
})
