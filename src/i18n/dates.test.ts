import {
  addFinnishDays,
  currentFinnishTime,
  finnishDaysBetween,
  formatDateSpan,
  zonedEndOfDay,
  zonedStartOfDay,
} from './dates'

describe('formatDateSpan', () => {
  it.each([
    { end: '', result: '', start: '' },
    { end: '', result: '1.1.2021', start: '2021-01-01' },
    { end: '2021-01-01', result: '1.1.2021', start: '2021-01-01' },
    { end: '2021-01-02', result: '1.–2.1.2021', start: '2021-01-01' },
    { end: '2021-02-02', result: '31.1.–2.2.2021', start: '2021-01-31' },
    { end: '2022-01-15', result: '15.12.2021–15.1.2022', start: '2021-12-15' },
    { end: '2022-01-15T23:59:59Z', result: '15.12.2021–16.1.2022', start: '2021-12-14T22:00:00Z' },
    { end: '', noYear: true, result: '1.1.', start: '2021-01-01' },
    { end: '2021-01-01', noYear: true, result: '1.1.', start: '2021-01-01' },
    { end: '2021-01-02', noYear: true, result: '1.–2.1.', start: '2021-01-01' },
    { end: '2021-02-02', noYear: true, result: '31.1.–2.2.', start: '2021-01-31' },
    { end: '2022-01-15', noYear: true, result: '15.12.–15.1.', start: '2021-12-15' },
    { end: '2022-01-15T23:59:59Z', noYear: true, result: '15.12.–16.1.', start: '2021-12-14T22:00:00Z' },
  ])('formats properly %p', (test) => {
    expect(formatDateSpan(test.start, 'fi', { end: test.end, noYear: test.noYear })).toEqual(test.result)
    expect(formatDateSpan(new Date(test.start), 'fi', { end: test.end, noYear: test.noYear })).toEqual(test.result)
    expect(formatDateSpan(test.start, 'fi', { end: new Date(test.end), noYear: test.noYear })).toEqual(test.result)
    expect(formatDateSpan(new Date(test.start), 'fi', { end: new Date(test.end), noYear: test.noYear })).toEqual(
      test.result
    )
  })

  it.each([
    { end: '2021-01-01', parentheses: true, result: '(1.1.2021)', start: '2021-01-01' },
    { end: '2021-01-02', parentheses: true, result: '(1.–2.1.2021)', start: '2021-01-01' },
    { end: '2021-02-02', parentheses: true, result: '(31.1.–2.2.2021)', start: '2021-01-31' },
    { end: '2022-01-15', parentheses: true, result: '(15.12.2021–15.1.2022)', start: '2021-12-15' },
    { end: '2021-01-01', noYear: true, parentheses: true, result: '(1.1.)', start: '2021-01-01' },
    { end: '2021-01-02', noYear: true, parentheses: true, result: '(1.–2.1.)', start: '2021-01-01' },
    { end: '2021-02-02', noYear: true, parentheses: true, result: '(31.1.–2.2.)', start: '2021-01-31' },
    { end: '2022-01-15', noYear: true, parentheses: true, result: '(15.12.–15.1.)', start: '2021-12-15' },
  ])('formats properly with parentheses %p', (test) => {
    expect(
      formatDateSpan(test.start, 'fi', { end: test.end, noYear: test.noYear, parentheses: test.parentheses })
    ).toEqual(test.result)
  })
})

describe('currentFinnishTime', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-04-01T10:20:30Z'))
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it('formats correctly', () => {
    expect(currentFinnishTime()).toEqual('2020-04-01T13:20:30+03:00')
  })
})

describe('zonedStartOfDay', () => {
  it('should use Europe/Helsinki by default', () => {
    expect(zonedStartOfDay('2024-01-01').toISOString()).toEqual('2024-01-01T00:00:00.000+02:00')
    expect(zonedStartOfDay('2024-06-02').toISOString()).toEqual('2024-06-02T00:00:00.000+03:00')
  })
})

describe('zonedEndOfDay', () => {
  it('should use Europe/Helsinki by default', () => {
    expect(zonedEndOfDay('2024-01-01').toISOString()).toEqual('2024-01-01T23:59:59.999+02:00')
    expect(zonedEndOfDay('2024-06-02').toISOString()).toEqual('2024-06-02T23:59:59.999+03:00')
  })
})

describe('finnishDaysBetween', () => {
  it.each([
    { expected: 0, from: '2026-03-26T22:00:00.000Z', name: 'the same day', to: '2026-03-26T22:00:00.000Z' },
    {
      expected: 77,
      from: '2026-03-26T22:00:00.000Z',
      name: 'across the spring change',
      to: '2026-06-11T21:00:00.000Z',
    },
    { expected: 90, from: '2026-02-14T22:00:00.000Z', name: 'winter to summer', to: '2026-05-15T21:00:00.000Z' },
    { expected: 169, from: '2026-05-14T21:00:00.000Z', name: 'summer to winter', to: '2026-10-30T22:00:00.000Z' },
    { expected: -90, from: '2026-05-15T21:00:00.000Z', name: 'backwards', to: '2026-02-14T22:00:00.000Z' },
  ])('counts Finnish calendar days $name', ({ expected, from, to }) => {
    expect(finnishDaysBetween(from, to)).toBe(expected)
  })
})

describe('addFinnishDays', () => {
  it.each([
    { days: 0, expected: '2026-03-26T22:00:00.000Z', from: '2026-03-26T22:00:00.000Z', name: 'zero days' },
    { days: 169, expected: '2026-10-30T22:00:00.000Z', from: '2026-05-14T21:00:00.000Z', name: 'into winter time' },
    { days: 90, expected: '2026-05-15T21:00:00.000Z', from: '2026-02-14T22:00:00.000Z', name: 'into summer time' },
    { days: -1, expected: '2026-03-28T22:00:00.000Z', from: '2026-03-29T21:00:00.000Z', name: 'backwards' },
  ])('keeps the Finnish wall clock: $name', ({ days, expected, from }) => {
    expect(addFinnishDays(from, days)).toBe(expected)
  })
})
