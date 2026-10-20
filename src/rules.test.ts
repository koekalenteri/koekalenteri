import { getRuleDate } from './rules'

describe('getRuleDate', () => {
  // The rules in force on a trial's day: the latest rule date on or before it, compared as day keys
  // (KOE-1547). An instant a stored row still holds is read as its Finnish day.
  it.each([
    ['the day before a rule date', '2023-04-14', '2016-04-01'],
    ['the rule date itself', '2023-04-15', '2023-04-15'],
    ['the day after it', '2023-04-16', '2023-04-15'],
    ['the first rule date', '1977-01-01', '1977-01-01'],
    ['22:30 UTC the evening before a rule date, its Finnish day', '2023-04-14T22:30:00.000Z', '2023-04-15'],
  ])('reads %s (%s) as the rules of %s', (_label, day, expected) => {
    expect(getRuleDate(day)).toBe(expected)
  })

  it('gives a value with no day the latest rules of the list', () => {
    expect(getRuleDate('', ['1977-01-01', '1986-01-01'])).toBe('1986-01-01')
    expect(getRuleDate('not a day', ['1977-01-01', '1986-01-01'])).toBe('1986-01-01')
  })
})
