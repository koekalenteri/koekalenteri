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
  expect(store.loaded).toEqual(false);

  let evt = await store.get('test4');
  expect(evt.id).toEqual('test4');
  expect(store.loaded).toEqual(false);

  // empty + defaults
  expect(store.filter).toEqual({ ...emptyFilter, withOpenEntry: true, withUpcomingEntry: true});

  await store.load();
  expect(store.loaded).toEqual(true);
  expect(store.events.length).toEqual(3);

  evt = await store.get(store.events[0].id);
  expect(evt).toEqual(store.events[0]);

  await store.setFilter({ ...emptyFilter });
  expect(store.events.length).toEqual(5);

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
    end: new Date() // the events relative to today are excluded
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
    ...emptyFilter,
    judge: [123]
  });
  expect(store.events.length).toEqual(1);

  await store.setFilter({
    ...emptyFilter,
    organizer: [2]
  });
  expect(store.events.length).toEqual(1);

  await store.setFilter({
    ...emptyFilter,
    withOpenEntry: true
  });
  expect(store.events.length).toEqual(2);
  expect(store.events[0]).toMatchObject({ id: 'test3' });
  expect(store.events[1]).toMatchObject({ id: 'test5' });

  await store.setFilter({
    ...emptyFilter,
    withClosingEntry: true
  });
  expect(store.events.length).toEqual(1);
  expect(store.events[0]).toMatchObject({ id: 'test5' });

  await store.setFilter({
    ...emptyFilter,
    withUpcomingEntry: true
  });
  expect(store.events.length).toEqual(1);
  expect(store.events[0]).toMatchObject({ id: 'test4' });

  await store.setFilter({
    ...emptyFilter,
    withFreePlaces: true
  });
  expect(store.events.length).toEqual(1);
  expect(store.events[0]).toMatchObject({ id: 'test5' });

  await store.setFilter({
    ...emptyFilter,
    withOpenEntry: true,
    withUpcomingEntry: true
  });
  expect(store.events.length).toEqual(3);
  expect(store.events[0]).toMatchObject({ id: 'test3' });
  expect(store.events[1]).toMatchObject({ id: 'test4' });
  expect(store.events[2]).toMatchObject({ id: 'test5' });

});
