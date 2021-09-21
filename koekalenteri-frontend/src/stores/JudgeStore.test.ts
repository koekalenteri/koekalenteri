import { JudgeStore } from "./JudgeStore";

jest.mock('../api/judge');

test('JudgeStore', async () => {
  const store = new JudgeStore();

  expect(store.judges).toEqual([])
  expect(store.loading).toEqual(false);

  await store.load();

  expect(store.judges.length).toEqual(3);
});
