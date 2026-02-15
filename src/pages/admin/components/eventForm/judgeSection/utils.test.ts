import type { EventClass, PublicJudge } from '../../../../../types'
import type { PartialEvent } from '../types'
import { filterClassesByJudgeId, hasJudge, makeArray, updateJudge } from './utils'

describe('judgeSection utils', () => {
  // Test data
  const judge1: PublicJudge = { id: 1, name: 'Judge One', official: true }
  const judge2: PublicJudge = { id: 2, name: 'Judge Two', official: true }
  const judge3: PublicJudge = { id: 3, name: 'Judge Three', official: true }

  const startDate = new Date('2023-01-01')
  const class1: EventClass = { class: 'ALO', date: startDate }
  const class2: EventClass = { class: 'AVO', date: startDate }
  const class3: EventClass = { class: 'VOI', date: startDate }

  describe('makeArray', () => {
    it('should convert a single judge to an array', () => {
      expect(makeArray(judge1)).toEqual([judge1])
    })

    it('should return a copy of an array', () => {
      const arr = [judge1, judge2]
      const result = makeArray(arr)
      expect(result).toEqual(arr)
      expect(result).not.toBe(arr) // Should be a new array
    })

    it('should return an empty array for undefined', () => {
      expect(makeArray(undefined)).toEqual([])
    })
  })

  describe('hasJudge', () => {
    it('should return true if class has the judge (single judge)', () => {
      const classWithJudge = { ...class1, judge: judge1 }
      expect(hasJudge(classWithJudge, 1)).toBe(true)
    })

    it('should return true if class has the judge (multiple judges)', () => {
      const classWithJudges = { ...class1, judge: [judge1, judge2] }
      expect(hasJudge(classWithJudges, 2)).toBe(true)
    })

    it('should return false if class does not have the judge', () => {
      const classWithJudge = { ...class1, judge: judge1 }
      expect(hasJudge(classWithJudge, 2)).toBe(false)
    })

    it('should return false if class has no judge', () => {
      expect(hasJudge(class1, 1)).toBe(false)
    })
  })

  describe('filterClassesByJudgeId', () => {
    it('should filter classes by judge id', () => {
      const classes = [
        { ...class1, judge: judge1 },
        { ...class2, judge: judge2 },
        { ...class3, judge: [judge1, judge3] },
      ]

      expect(filterClassesByJudgeId(classes, 1)).toEqual([
        { ...class1, judge: judge1 },
        { ...class3, judge: [judge1, judge3] },
      ])
    })

    it('should return empty array if no classes match', () => {
      const classes = [
        { ...class1, judge: judge1 },
        { ...class2, judge: judge2 },
      ]

      expect(filterClassesByJudgeId(classes, 3)).toEqual([])
    })

    it('should handle undefined classes', () => {
      expect(filterClassesByJudgeId(undefined, 1)).toBeUndefined()
    })
  })

  describe('updateJudge', () => {
    let event: Pick<PartialEvent, 'startDate' | 'classes'>

    beforeEach(() => {
      // Reset event before each test
      event = {
        classes: [{ ...class1 }, { ...class2 }, { ...class3 }],
        startDate,
      }
    })

    it('should add a judge to selected classes', () => {
      const values = [class1] // Select only class1
      const result = updateJudge(event, undefined, judge1, values)

      expect(result?.[0].judge).toEqual([judge1])
      expect(result?.[1].judge).toEqual([])
      expect(result?.[2].judge).toEqual([])
    })

    it('should replace a judge in selected classes', () => {
      // Setup: Class1 already has judge1
      event.classes[0].judge = judge1

      const values = [class1] // Select only class1
      const result = updateJudge(event, judge1.id, judge2, values)

      // Judge1 should be replaced with judge2
      expect(result?.[0].judge).toEqual([judge2])
    })

    it('should preserve judge position when replacing', () => {
      // Setup: Class1 has multiple judges
      event.classes[0].judge = [judge1, judge2, judge3]

      const values = [class1] // Select only class1
      const result = updateJudge(event, judge2.id, { ...judge2, name: 'Updated Judge Two' }, values)

      // Judge2 should be updated at the same position
      expect(result?.[0].judge).toEqual([judge1, { ...judge2, name: 'Updated Judge Two' }, judge3])
    })

    it('should remove a judge from non-selected classes', () => {
      // Setup: All classes have judge1
      event.classes[0].judge = judge1
      event.classes[1].judge = judge1
      event.classes[2].judge = judge1

      const values = [class1] // Select only class1
      const result = updateJudge(event, judge1.id, judge1, values)

      // Judge1 should remain in class1 but be removed from class2 and class3
      expect(result?.[0].judge).toEqual([judge1])
      expect(result?.[1].judge).toEqual([])
      expect(result?.[2].judge).toEqual([])
    })

    it('should handle multiple judges in a class', () => {
      // Setup: Class1 has judge1 and judge3
      event.classes[0].judge = [judge1, judge3]

      const values = [class1] // Select only class1
      const result = updateJudge(event, judge1.id, judge2, values)

      // Judge1 should be replaced with judge2, judge3 should remain
      expect(result?.[0].judge).toEqual([judge2, judge3])
    })

    it('should handle removing a judge completely', () => {
      // Setup: All classes have judge1
      event.classes[0].judge = judge1
      event.classes[1].judge = judge1
      event.classes[2].judge = judge1

      const result = updateJudge(event, judge1.id, undefined, [])

      // Judge1 should be removed from all classes
      expect(result?.[0].judge).toEqual([])
      expect(result?.[1].judge).toEqual([])
      expect(result?.[2].judge).toEqual([])
    })

    it('should not add duplicate judges', () => {
      // Setup: Class1 already has judge1
      event.classes[0].judge = judge1

      const values = [class1] // Select only class1
      const result = updateJudge(event, undefined, judge1, values)

      // Judge1 should not be duplicated
      expect(result?.[0].judge).toEqual([judge1])
    })

    it('should handle the case where oldJudgeId is undefined', () => {
      // Setup: Class1 has judge1 and judge2
      event.classes[0].judge = [judge1, judge2]

      const values = [class1] // Select only class1
      const result = updateJudge(event, undefined, judge3, values)

      // Judge3 should be added to the array
      expect(result?.[0].judge).toEqual([judge1, judge2, judge3])
    })

    it('should fix the bug where previous judge remains when changing judges', () => {
      // Setup: Class1 has judge1
      event.classes[0].judge = judge1

      const values = [class1] // Select only class1
      const result = updateJudge(event, judge1.id, judge2, values)

      // Judge1 should be replaced with judge2, not added alongside
      expect(result?.[0].judge).toEqual([judge2])
      expect(result?.[0].judge).not.toContainEqual(judge1)
    })

    it('should keep remaining judges intact and in order when removing one judge from multiple', () => {
      // Setup: Class1 has multiple judges in specific order
      event.classes[0].judge = [judge1, judge2, judge3]

      // Remove judge2 (the middle one)
      const result = updateJudge(event, judge2.id, undefined, [])

      // Judge1 and judge3 should remain in the same order
      expect(result?.[0].judge).toEqual([judge1, judge3])
      expect(result?.[0].judge.length).toBe(2)
      expect(result?.[0].judge[0]).toEqual(judge1)
      expect(result?.[0].judge[1]).toEqual(judge3)
    })
  })
})
