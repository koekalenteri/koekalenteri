import { Event, extendEvent } from ".";
import { emptyEvent } from './test-utils/emptyEvent';


const event: Event = {
  ...emptyEvent,
  entryStartDate: new Date('2021-01-02'),
  entryEndDate: new Date('2021-01-13'),
}

test.each([
  { date: '2021-01-01 23:59', open: false, closing: false },
  { date: '2021-01-02', open: true, closing: false },
  { date: '2021-01-02 00:00', open: true, closing: false },
  { date: '2021-01-05', open: true, closing: false },
  { date: '2021-01-06', open: true, closing: true },
  { date: '2021-01-13', open: true, closing: true },
  { date: '2021-01-13 23:59', open: true, closing: true },
  { date: '2021-01-14 00:00', open: false, closing: false },
])(`When entry is 2021-01-02 to 2021-01-13, @$date: isEntryOpen: $open, isEntryClosing: $closing`, ({ date, open, closing }) => {
  expect(extendEvent(event, new Date(date)).isEntryOpen).toEqual(open);
  expect(extendEvent(event, new Date(date)).isEntryClosing).toEqual(closing);
});


test('isEntryOpen with mocked date', function() {
  jest.useFakeTimers();

  jest.setSystemTime(new Date('2021-01-01'));
  expect(extendEvent(event).isEntryOpen).toEqual(false);

  jest.setSystemTime(new Date('2021-01-02'));
  expect(extendEvent(event).isEntryOpen).toEqual(true);

  jest.useRealTimers();
});

