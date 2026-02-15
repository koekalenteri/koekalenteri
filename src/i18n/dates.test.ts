import { currentFinnishTime, formatDateSpan, zonedEndOfDay, zonedStartOfDay } from './dates'

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
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2020-04-01T10:20:30Z'))
  })

  afterAll(() => {
    jest.useRealTimers()
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
