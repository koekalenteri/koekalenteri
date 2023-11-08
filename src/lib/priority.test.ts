import { PRIORITY, priorityValuesToPriority } from './priority'

describe('lib/priority', () => {
  describe('PRIORITY', () => {
    it('should match snapshot and length', () => {
      expect(PRIORITY).toMatchSnapshot()
      expect(PRIORITY.length).toEqual(8)
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
  })
})
