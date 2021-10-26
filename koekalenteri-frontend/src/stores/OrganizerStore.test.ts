import { OrganizerStore } from "./OrganizerStore";

jest.mock('../api/organizer');

test('OrganizerStore', async () => {
  const store = new OrganizerStore();

  expect(store.organizers).toEqual([])
  expect(store.loading).toEqual(false);

  await store.load();

  expect(store.loading).toEqual(false);
  expect(store.organizers.length).toEqual(2);
});
