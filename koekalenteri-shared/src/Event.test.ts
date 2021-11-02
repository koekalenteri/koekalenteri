import { Event, extendEvent } from ".";
import { emptyEvent } from './test-utils/emptyEvent';


const event: Event = {
  ...emptyEvent,
  entryStartDate: new Date('2021-01-02'),
  entryEndDate: new Date('2021-01-03'),
}

test.each([
  { date: '2021-01-01 23:59', result: false },
  { date: '2021-01-02', result: true },
  { date: '2021-01-02 00:00', result: true },
  { date: '2021-01-03', result: true },
  { date: '2021-01-03 23:59', result: true },
  { date: '2021-01-04 00:00', result: false },
])(`When entry is 2021-01-02 to 2021-01-03, isEntryOpen at $date should be $result`, ({ date, result }) => {
  expect(extendEvent(event, new Date(date)).isEntryOpen).toEqual(result);
});


test('isEntryOpen with mocked date', function() {
  jest.useFakeTimers();

  jest.setSystemTime(new Date('2021-01-01'));
  expect(extendEvent(event).isEntryOpen).toEqual(false);

  jest.setSystemTime(new Date('2021-01-02'));
  expect(extendEvent(event).isEntryOpen).toEqual(true);

  jest.useRealTimers();
});
