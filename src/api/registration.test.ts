import type { Registration } from '../types'
import fetchMock from 'jest-fetch-mock'
import { API_BASE_URL } from '../routeConfig'
import { getRegistration, getRegistrations, getStartList, putRegistration, putRegistrationGroups } from './registration'

const mockRegistration: Registration = {
  agreeToTerms: true,
  breeder: {
    location: 'test-location',
    name: 'test-breeder',
  },
  cancelled: false,
  class: 'AVO',
  createdAt: new Date(),
  createdBy: 'test-user',
  dates: [{ date: new Date(), time: 'ap' }],
  dog: {
    regNo: 'test-reg',
    results: [],
  },
  eventId: 'test-id',
  eventType: 'test-type',
  handler: {
    email: 'test-email',
    location: 'test-location',
    membership: false,
    name: 'test-handler',
    phone: 'test-phone',
  },
  id: 'test-registration-id',
  language: 'fi',
  modifiedAt: new Date(),
  modifiedBy: 'test-user',
  notes: 'test-notes',
  owner: {
    email: 'test-email',
    location: 'test-location',
    membership: false,
    name: 'test-owner',
    phone: 'test-phone',
  },
  ownerHandles: false,
  payer: {
    email: 'test-email',
    name: 'test-payer',
    phone: 'test-phone',
  },
  paymentStatus: 'SUCCESS',
  qualifyingResults: [],
  reserve: '',
  results: [
    {
      class: 'test-class',
      date: new Date(),
      id: 'result-id',
      judge: 'test-judge',
      location: 'test-location',
      official: false,
      regNo: 'test-reg',
      result: 'test-result',
      type: 'test-type',
    },
  ],
}

fetchMock.enableMocks()

beforeEach(() => fetchMock.resetMocks())

test('getRegistrations', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET'
      ? Promise.resolve(JSON.stringify([mockRegistration]))
      : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const result = await getRegistrations('test-id', 'test-token')

  expect(result.length).toEqual(1)
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/admin/registration/test-id`)
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
  expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/registration/test-id/test-registration-id`)
})

test('putRegistration', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'POST'
      ? Promise.resolve(JSON.stringify(mockRegistration))
      : Promise.reject(new Error(`${req.method} !== 'POST'`))
  )

  const result = await putRegistration(mockRegistration)
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/registration/`)
  expect(result.id).not.toBeUndefined()
})

test('putRegistrationGroups', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'POST'
      ? Promise.resolve(JSON.stringify({ items: [mockRegistration] }))
      : Promise.reject(new Error(`${req.method} !== 'POST'`))
  )

  const { items } = await putRegistrationGroups('test-id', [mockRegistration], 'test-token')
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/admin/reg-groups/test-id`)
  expect(items.length).toEqual(1)
})

describe('getStartList', () => {
  it('should call correct endpoint', async () => {
    await getStartList('test-id')
    expect(fetchMock.mock.calls.length).toEqual(1)
    expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/startlist/test-id`)
  })
})
