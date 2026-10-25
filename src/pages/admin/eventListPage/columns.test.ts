import type { DayKey } from '@/types'
import useEventListColumns, { classesText, compareByStartDayLatestFirst } from './columns'

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

  // event.classes keeps the order the classes were picked in, one entry per class and day (KOE-1596).
  it('lists each class once, as ALO, AVO, VOI, whatever order they were picked in (KOE-1596)', () => {
    expect(
      classesText([
        { class: 'VOI', date: '2026-10-10' },
        { class: 'ALO', date: '2026-10-10' },
        { class: 'AVO', date: '2026-10-11' },
        { class: 'VOI', date: '2026-10-11' },
      ])
    ).toBe('ALO, AVO, VOI')
  })

  it('reads the class names of an event stored as plain strings', () => {
    expect(classesText(['VOI', 'ALO'])).toBe('ALO, VOI')
  })

  it('shows nothing for an event without a classes array', () => {
    expect(classesText(undefined)).toBe('')
    expect(classesText({ 0: { class: 'ALO' } })).toBe('')
  })
})
