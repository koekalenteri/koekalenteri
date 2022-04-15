import { RootStore } from "./RootStore";

jest.mock('../api/judge');
jest.mock('../api/organizer');
jest.mock('../api/eventType');

test('RootStore', async () => {

  const store = new RootStore();
  expect(store.eventTypeStore.loading).toEqual(true);
  expect(store.judgeStore.loading).toEqual(true);
  expect(store.organizerStore.loading).toEqual(true);

  expect(store.eventTypeStore.eventTypes.length).toEqual(0);
  expect(store.judgeStore.judges.length).toEqual(0);
  expect(store.organizerStore.organizers.length).toEqual(0);

  await new Promise(process.nextTick);
  await new Promise(process.nextTick);

  expect(store.eventTypeStore.loading).toEqual(false);
  expect(store.judgeStore.loading).toEqual(false);
  expect(store.organizerStore.loading).toEqual(false);

  expect(store.eventTypeStore.eventTypes.length).toEqual(1);
  expect(store.judgeStore.judges.length).toEqual(3);
  expect(store.organizerStore.organizers.length).toEqual(2);
});
