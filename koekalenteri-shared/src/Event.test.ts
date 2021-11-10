import { parseISO } from "date-fns";
import { Event, extendEvent } from ".";
import { emptyEvent } from './test-utils/emptyEvent';

/**
 * Using parseISO here, because new Date() for a date without time defaults to midnight in GMT.
 * new Date() could also be inconsistent between browsers.
 * We want midnight in current timezone.
 */

const event: Event = {
  ...emptyEvent,
  entryStartDate: parseISO('2021-01-02'),
  entryEndDate: parseISO('2021-01-13'),
}

test.each([
  { date: '2021-01-01 23:59', open: false, closing: false, upcoming: true },
  { date: '2021-01-02', open: true, closing: false, upcoming: false },
  { date: '2021-01-02 00:00', open: true, closing: false, upcoming: false },
  { date: '2021-01-05', open: true, closing: false, upcoming: false },
  { date: '2021-01-06', open: true, closing: true, upcoming: false },
  { date: '2021-01-13', open: true, closing: true, upcoming: false },
  { date: '2021-01-13 23:59', open: true, closing: true, upcoming: false },
  { date: '2021-01-14 00:00', open: false, closing: false, upcoming: false },
])(`When entry is 2021-01-02 to 2021-01-13, @$date: isEntryOpen: $open, isEntryClosing: $closing, isEntryUpcoming: $upcoming`, ({ date, open, closing, upcoming }) => {
  expect(extendEvent(event, parseISO(date)).isEntryOpen).toEqual(open);
  expect(extendEvent(event, parseISO(date)).isEntryClosing).toEqual(closing);
  expect(extendEvent(event, parseISO(date)).isEntryUpcoming).toEqual(upcoming);
});

test('isEntryOpen with mocked date', function() {
  jest.useFakeTimers();

  jest.setSystemTime(parseISO('2021-01-01'));
  expect(extendEvent(event).isEntryOpen).toEqual(false);

  jest.setSystemTime(parseISO('2021-01-02'));
  expect(extendEvent(event).isEntryOpen).toEqual(true);

  jest.useRealTimers();
});

