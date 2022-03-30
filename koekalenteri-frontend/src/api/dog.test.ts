import fetchMock from 'jest-fetch-mock';
import { JsonDog } from "koekalenteri-shared/model";
import { API_BASE_URL } from "../config";
import { getDog, rehydrateDog } from './dog';

fetchMock.enableMocks();

beforeEach(() => fetchMock.resetMocks());

test('rehydrateDog', function() {
  const dog: JsonDog = { regNo: 'abc', name: 'def', rfid: '', dob: '20210101T00:00:00', refreshDate: '20200101T00:00:00' };
  const rdog = rehydrateDog(dog);

  expect(rdog.dob).toBeInstanceOf(Date);
  expect(rdog.refreshDate).toBeInstanceOf(Date);
})

test('getDog', async () => {
  fetchMock.mockResponse(req => req.method === 'GET'
    ? Promise.resolve(JSON.stringify({regNo: 'testReg'}))
    : Promise.reject(new Error(`${req.method} !== 'GET'`)));

  const dog = await getDog('testReg');

  expect(dog.regNo).toEqual('testReg');
  expect(fetchMock.mock.calls.length).toEqual(1);
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/dog/testReg');

  const dog2 = await getDog('testReg2', true);

  expect(dog2.regNo).toEqual('testReg');
  expect(fetchMock.mock.calls.length).toEqual(2);
  expect(fetchMock.mock.calls[1][0]).toEqual(API_BASE_URL + '/dog/testReg2?refresh');
});
