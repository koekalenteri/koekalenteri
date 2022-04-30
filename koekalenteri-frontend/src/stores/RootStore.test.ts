import { RootStore } from "./RootStore";

jest.mock('../api/eventType');
jest.mock('../api/judge');
jest.mock('../api/official');
jest.mock('../api/organizer');

test('RootStore', async () => {

  const store = new RootStore();

  expect(store.eventTypeStore.eventTypes.length).toEqual(0);
  expect(store.judgeStore.judges.length).toEqual(0);
  expect(store.officialStore.officials.length).toEqual(0);
  expect(store.organizerStore.organizers.length).toEqual(0);

  await store.load();

  expect(store.eventTypeStore.eventTypes.length).toEqual(1);
  expect(store.judgeStore.judges.length).toEqual(3);
  expect(store.officialStore.officials.length).toEqual(3);
  expect(store.organizerStore.organizers.length).toEqual(2);
});
