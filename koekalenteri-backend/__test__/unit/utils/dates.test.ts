import { formatDateSpan } from '../../../src/utils/dates';

test('formatDateSpan', () => {
  const tests = [
    { start: '', end: '', result: '' },
    { start: '2021-01-01', end: '', result: '1.1.2021' },
    { start: '2021-01-01', end: '2021-01-01', result: '1.1.2021' },
    { start: '2021-01-01', end: '2021-01-02', result: '1.-2.1.2021' },
    { start: '2021-01-31', end: '2021-02-02', result: '31.1.-2.2.2021' },
    { start: '2021-12-15', end: '2022-01-15', result: '15.12.2021-15.1.2022' },
  ];

  for (const test of tests) {
    expect(formatDateSpan(test.start, test.end)).toEqual(test.result);
    expect(formatDateSpan(new Date(test.start), test.end)).toEqual(test.result);
    expect(formatDateSpan(test.start, new Date(test.end))).toEqual(test.result);
    expect(formatDateSpan(new Date(test.start), new Date(test.end))).toEqual(test.result);
  }
});
