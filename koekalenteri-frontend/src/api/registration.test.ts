import fetchMock from 'jest-fetch-mock'
import { Registration } from 'koekalenteri-shared/model'

import { API_BASE_URL } from '../routeConfig'

import { getRegistration, getRegistrations, putRegistration, putRegistrationGroup } from './registration'

const mockRegistration: Registration = {
  id: 'test-registration-id',
  createdAt: new Date(),
  createdBy: 'test-user',
  modifiedAt: new Date(),
  modifiedBy: 'test-user',
  agreeToTerms: true,
  breeder: {
    name: 'test-breeder',
    location: 'test-location',
  },
  class: 'test-class',
  dates: [{ date: new Date(), time: 'ap' }],
  dog: {
    regNo: 'test-reg',
    results: [],
  },
  eventId: 'test-id',
  eventType: 'test-type',
  handler: {
    name: 'test-handler',
    location: 'test-location',
    email: 'test-email',
    phone: 'test-phone',
    membership: false,
  },
  language: 'fi',
  notes: 'test-notes',
  owner: {
    name: 'test-owner',
    location: 'test-location',
    email: 'test-email',
    phone: 'test-phone',
    membership: false,
  },
  ownerHandles: false,
  qualifyingResults: [],
  reserve: '',
  results: [
    {
      id: 'result-id',
      regNo: 'test-reg',
      date: new Date(),
      official: false,
      type: 'test-type',
      class: 'test-class',
      result: 'test-result',
      location: 'test-location',
      judge: 'test-judge',
    },
  ],
  paymentStatus: 'SUCCESS',
  cancelled: false,
}

fetchMock.enableMocks()

beforeEach(() => fetchMock.resetMocks())

test('getRegistrations', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET'
      ? Promise.resolve(JSON.stringify([mockRegistration]))
      : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const result = await getRegistrations('test-id')

  expect(result.length).toEqual(1)
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/admin/registration/test-id')
})

test('getRegistration', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET'
      ? Promise.resolve(JSON.stringify(mockRegistration))
      : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const result = await getRegistration('test-id', 'test-registration-id')

  expect(result).toMatchObject(mockRegistration)
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/registration/test-id/test-registration-id')
})

test('putRegistration', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'POST'
      ? Promise.resolve(JSON.stringify(mockRegistration))
      : Promise.reject(new Error(`${req.method} !== 'POST'`))
  )

  const result = await putRegistration(mockRegistration)
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/registration/')
  expect(result.id).not.toBeUndefined()
})

test('putRegistrationGroup', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'POST'
      ? Promise.resolve(JSON.stringify(mockRegistration))
      : Promise.reject(new Error(`${req.method} !== 'POST'`))
  )

  const result = await putRegistrationGroup(mockRegistration)
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/admin/registration/test-id/test-registration-id')
  expect(result.id).not.toBeUndefined()
})
