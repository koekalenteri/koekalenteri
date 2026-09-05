import { PRIORITY, PRIORITY_INVITED, priorityValuesToPriority, RESTRICTION } from './priority'

describe('lib/priority', () => {
  describe('PRIORITY', () => {
    it('should match snapshot and length', () => {
      expect(PRIORITY).toMatchSnapshot()
      expect(PRIORITY).toHaveLength(8)
    })
  })

  describe('RESTRICTION', () => {
    it('offers the members and the named breeds, but not the invitations (KOE-524)', () => {
      expect(RESTRICTION.map((p) => p.value)).toEqual(['member', '110', '111', '121', '122', '263', '312'])
      expect(RESTRICTION.some((p) => p.value === PRIORITY_INVITED)).toBe(false)
    })
  })

  describe('priorityValuesToPriority', () => {
    it.each`
      values
      ${undefined}
      ${null}
      ${NaN}
      ${''}
      ${{}}
      ${[null]}
      ${['kissa', 'koira']}
    `('should ignore invalid values: $values', ({ values }) => {
      expect(priorityValuesToPriority(values)).toEqual([])
    })

    it.each`
      values                                               | expected
      ${[PRIORITY[0].value]}                               | ${[PRIORITY[0]]}
      ${[PRIORITY[1].value]}                               | ${[PRIORITY[1]]}
      ${[PRIORITY[2].value, PRIORITY[3].value]}            | ${[PRIORITY[2], PRIORITY[3]]}
      ${[PRIORITY[4].value, 'kissa', PRIORITY[5].value]}   | ${[PRIORITY[4], PRIORITY[5]]}
      ${[PRIORITY[7].value, undefined, PRIORITY[7].value]} | ${[PRIORITY[7]]}
    `('should map valid values, ignoring invalid and removing duplicates : $values', ({ values, expected }) => {
      expect(priorityValuesToPriority(values)).toEqual(expected)
    })

    it('reads the values against the given vocabulary', () => {
      expect(priorityValuesToPriority([PRIORITY_INVITED, 'member', '312'], RESTRICTION)).toEqual([
        RESTRICTION[0],
        RESTRICTION[6],
      ])
    })
  })
})
