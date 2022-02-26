import { PrivateStore } from "./PrivateStore";

jest.mock('../api/event');
jest.mock('../api/official');

test('PrivateStore', async () => {

  const store = new PrivateStore();

  expect(store.loading).toEqual(false);
  expect(store.loaded).toEqual(false);

  const promise = store.load();
  expect(store.loading).toEqual(true);
  await promise;
  expect(store.loaded).toEqual(true);
  expect(store.events.length).toEqual(5);
  expect(store.officials.length).toEqual(3);

  const origLength = store.events.length;
  const newEvent = await store.putEvent({ eventType: 'saveTest' });
  expect(newEvent.id).toBeDefined();
  expect(store.events.length).toBe(origLength + 1);

  const deletedEvent = await store.deleteEvent(newEvent);
  expect(deletedEvent).toBeDefined();
  expect(deletedEvent?.deletedAt).toBeDefined();
  expect(store.events.length).toBe(origLength);
});
