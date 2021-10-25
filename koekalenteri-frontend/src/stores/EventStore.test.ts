import { EventStore } from "./EventStrore";

jest.mock('../api/event');

test('EventStore', async () => {
  const store = new EventStore();

  expect(store.events).toEqual([])
  expect(store.loading).toEqual(false);
  expect(store.filter).toEqual({ start: null, end: null, eventType: [], eventClass: [], judge: [], organizer: [] });

  await store.load();

  expect(store.events.length).toEqual(2);

  await store.setFilter({ start: new Date('2021-01-01'), end: new Date('2021-02-11'), eventType: [], eventClass: [], judge: [], organizer: [] });
  expect(store.events.length).toEqual(1);
  expect(store.events[0]).toMatchObject({ id: 'test1' });

  await store.setFilter({ start: new Date('2021-02-13'), end: new Date('2021-12-31'), eventType: [], eventClass: [], judge: [], organizer: [] });
  expect(store.events.length).toEqual(1);
  expect(store.events[0]).toMatchObject({ id: 'test2' });

  await store.setFilter({ start: new Date('2021-02-11'), end: new Date('2021-02-12'), eventType: [], eventClass: [], judge: [], organizer: [] });
  expect(store.events.length).toEqual(2);

  await store.setFilter({ start: null, end: null, eventType: ['type1'], eventClass: [], judge: [], organizer: [] });
  expect(store.events.length).toEqual(1);
  expect(store.events[0]).toMatchObject({ id: 'test1' });

  await store.setFilter({ start: null, end: null, eventType: [], eventClass: ['class1'], judge: [], organizer: [] });
  expect(store.events.length).toEqual(1);
  expect(store.events[0]).toMatchObject({ id: 'test1' });

  await store.setFilter({ start: null, end: null, eventType: ['type2'], eventClass: ['class1'], judge: [], organizer: [] });
  expect(store.events.length).toEqual(0);

  await store.setFilter({ start: null, end: null, eventType: [], eventClass: [], judge: [123], organizer: [] });
  expect(store.events.length).toEqual(1);
});
