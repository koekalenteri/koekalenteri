import fetchMock from "jest-fetch-mock";
import { getEvents, getEvent } from './event';
import { emptyEvent } from "koekalenteri-shared/src/test-utils/emptyEvent";
import { API_BASE_URL } from "./http";

fetchMock.enableMocks();

beforeEach(() => fetchMock.resetMocks());

test('getEvents', async () => {
  fetchMock.mockResponse(req => req.method === 'GET'
    ? Promise.resolve(JSON.stringify([emptyEvent]))
    : Promise.reject(new Error(`${req.method} !== 'GET'`)));

  const events = await getEvents();

  expect(events.length).toEqual(1);
  expect(fetchMock.mock.calls.length).toEqual(1);
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/event/');
});

test('getEvent', async () => {
  fetchMock.mockResponse(req => req.method === 'GET'
    ? Promise.resolve(JSON.stringify(emptyEvent))
    : Promise.reject(new Error(`${req.method} !== 'GET'`)));

  const event = await getEvent('TestEventType', 'TestEventID');

  expect(event).toEqual(emptyEvent);
  expect(fetchMock.mock.calls.length).toEqual(1);
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/event/TestEventType/TestEventID');
});
