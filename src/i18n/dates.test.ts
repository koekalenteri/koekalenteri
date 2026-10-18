import { describeInTimeZone } from '../test-utils/timeZone'
import { currentFinnishTime, formatDate, formatDateSpan } from './dates'

describe('formatDate', () => {
  for (const zone of ['Asia/Tokyo', 'America/New_York']) {
    describeInTimeZone(zone, () => {
      // A bare day used to be parsed as the machine's midnight, which is the evening before in Finland
      // east of it: release note 2026-10-17 read 16.10. in Tokyo (KOE-1545).
      it('formats a stamp without a zone as the Finnish wall-clock time it names', () => {
        expect(formatDate('2026-06-28T00:00:00', 'd.M.yyyy')).toBe('28.6.2026')
      })

      it('formats a span whose end has no calendar day as its start', () => {
        expect(formatDateSpan('2026-06-28', 'fi', { end: '0001-01-01T00:00:00.000Z' })).toBe('28.6.2026')
      })

      it('formats a bare day as the day it names', () => {
        expect(formatDate('2026-10-17', 'd.M.yyyy')).toBe('17.10.2026')
      })

      it('formats an instant in Finnish time', () => {
        expect(formatDate('2026-10-17T20:59:59.999Z', 'd.M.yyyy HH:mm')).toBe('17.10.2026 23:59')
        expect(formatDate(new Date('2026-10-17T21:00:00.000Z'), 'd.M.yyyy HH:mm')).toBe('18.10.2026 00:00')
      })

      it('formats nothing for a string that is neither', () => {
        expect(formatDate('foo', 'd.M.yyyy')).toBe('')
      })
    })
  }
})

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
    // The year is told apart in Finnish time: the last moment of 2021 is 2022 in UTC.
    { end: '2021-12-31T21:59:59Z', result: '30.–31.12.2021', start: '2021-12-29T22:00:00Z' },
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
