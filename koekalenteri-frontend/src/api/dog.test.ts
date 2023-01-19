import fetchMock from 'jest-fetch-mock'

import { API_BASE_URL } from '../routeConfig'

import { getDog  } from './dog'

fetchMock.enableMocks()

beforeEach(() => fetchMock.resetMocks())

test('getDog', async () => {
  fetchMock.mockResponse(req => req.method === 'GET'
    ? Promise.resolve(JSON.stringify({regNo: 'testReg'}))
    : Promise.reject(new Error(`${req.method} !== 'GET'`)))

  const dog = await getDog('testReg')

  expect(dog.regNo).toEqual('testReg')
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/dog/testReg')

  const dog2 = await getDog('testReg2', true)

  expect(dog2.regNo).toEqual('testReg')
  expect(fetchMock.mock.calls.length).toEqual(2)
  expect(fetchMock.mock.calls[1][0]).toEqual(API_BASE_URL + '/dog/testReg2?refresh')
})
