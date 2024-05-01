import { formatMoney } from './money'

describe('money', () => {
  describe('formatMoney', () => {
    it.each`
      value  | expected
      ${0}   | ${'0,00\u00A0€'}
      ${0.5} | ${'0,50\u00A0€'}
      ${34}  | ${'34,00\u00A0€'}
    `('should format %p as %p', ({ value, expected }) => {
      expect(formatMoney(value)).toEqual(expected)
    })
  })
})
