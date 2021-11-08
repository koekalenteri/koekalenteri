import { getEvents, getEvent } from './event';

jest.mock('./event');

test('getEvents', async () => {
  const events = await getEvents();
  expect(events.length).toEqual(5);
});

test('getEvent', async () => {
  const event = await getEvent('type1', 'test1');
  expect(event.id).toEqual('test1');
});
