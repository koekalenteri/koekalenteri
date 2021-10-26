import { EventStore } from "./EventStrore";

jest.mock('../api/event');

test('EventStore', async () => {
  const store = new EventStore();

  const emptyFilter = {
    start: null,
    end: null,
    eventType: [],
    eventClass: [],
    judge: [],
    organizer: [],
    withClosingEntry: false,
    withFreePlaces: false,
    withOpenEntry: false,
    withUpcomingEntry: false
  };

  expect(store.events).toEqual([])
  expect(store.loading).toEqual(false);
  expect(store.filter).toEqual(emptyFilter);

  await store.load();

  expect(store.events.length).toEqual(2);

  await store.setFilter({
    ...emptyFilter,
    start: new Date('2021-01-01'),
    end: new Date('2021-02-11')
  });
  expect(store.events.length).toEqual(1);
  expect(store.events[0]).toMatchObject({ id: 'test1' });

  await store.setFilter({
    ...emptyFilter,
    start: new Date('2021-02-13'),
    end: new Date('2021-12-31')
  });
  expect(store.events.length).toEqual(1);
  expect(store.events[0]).toMatchObject({ id: 'test2' });

  await store.setFilter({
    ...emptyFilter,
    start: new Date('2021-02-11'),
    end: new Date('2021-02-12')
  });
  expect(store.events.length).toEqual(2);

  await store.setFilter({
    ...emptyFilter,
    eventType: ['type1']
  });
  expect(store.events.length).toEqual(1);
  expect(store.events[0]).toMatchObject({ id: 'test1' });

  await store.setFilter({
    ...emptyFilter,
    eventClass: ['class1']
  });
  expect(store.events.length).toEqual(1);
  expect(store.events[0]).toMatchObject({ id: 'test1' });

  await store.setFilter({
    ...emptyFilter,
    eventType: ['type2'],
    eventClass: ['class1']
  });
  expect(store.events.length).toEqual(0);

  await store.setFilter({
    ...emptyFilter, judge: [123]
  });
  expect(store.events.length).toEqual(1);
});
