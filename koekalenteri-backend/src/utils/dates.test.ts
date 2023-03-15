import { jest } from '@jest/globals'

import { currentFinnishTime, formatDateSpan } from './dates'

test('formatDateSpan', () => {
  const tests = [
    { start: '', end: '', result: '' },
    { start: '2021-01-01', end: '', result: '1.1.2021' },
    { start: '2021-01-01', end: '2021-01-01', result: '1.1.2021' },
    { start: '2021-01-01', end: '2021-01-02', result: '1.-2.1.2021' },
    { start: '2021-01-31', end: '2021-02-02', result: '31.1.-2.2.2021' },
    { start: '2021-12-15', end: '2022-01-15', result: '15.12.2021-15.1.2022' },
    { start: '2021-12-14T22:00:00.000Z', end: '2022-01-14T22:00:00.000Z', result: '15.12.2021-15.1.2022' },
    { start: '2023-06-24T21:00:00.000Z', end: '', result: '25.6.2023' },
  ]

  for (const test of tests) {
    expect(formatDateSpan(test.start, test.end)).toEqual(test.result)
    expect(formatDateSpan(new Date(test.start), test.end)).toEqual(test.result)
    expect(formatDateSpan(test.start, new Date(test.end))).toEqual(test.result)
    expect(formatDateSpan(new Date(test.start), new Date(test.end))).toEqual(test.result)
  }
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
