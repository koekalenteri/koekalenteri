import type { Registration } from '../types'
import { API_BASE_URL } from '../routeConfig'
import fetchMock from '../test-utils/fetchMock'
import {
  getRegistration,
  getRegistrations,
  getStartList,
  getStartListPreview,
  patchAdminRegistration,
  patchRegistration,
  postAdminRegistration,
  postRegistration,
  putRegistrationGroups,
} from './registration'

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

const mockRegistrationCreateRequest = () => {
  const { editToken: _editToken, ...registration } = mockRegistration
  return { ...registration, id: '' }
}

fetchMock.enableMocks()

beforeEach(() => {
  fetchMock.resetMocks()
  fetchMock.enableMocks()
  sessionStorage.clear()
})

test('getRegistrations', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET'
      ? Promise.resolve(JSON.stringify([mockRegistration]))
      : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const result = await getRegistrations('test-id', 'test-token')

  expect(result).toHaveLength(1)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/registration/test-id`, expect.any(Object))
})

test('getRegistrations with since', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET'
      ? Promise.resolve(JSON.stringify({ cursor: 456, deletedIds: ['deleted-id'], items: [mockRegistration] }))
      : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const since = new Date('2026-01-02T00:00:00.000Z')
  const result = await getRegistrations('test-id', 'test-token', undefined, since)

  expect(result.items).toEqual([mockRegistration])
  expect(result.deletedIds).toEqual(['deleted-id'])
  expect(result.cursor).toEqual(456)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/admin/registration/test-id?since=${since.getTime()}`,
    expect.any(Object)
  )
})

test('getRegistration', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET'
      ? Promise.resolve(JSON.stringify(mockRegistration))
      : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const result = await getRegistration('test-id', 'test-registration-id')

  expect(result).toMatchObject(mockRegistration)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/registration/test-id/test-registration-id`,
    expect.any(Object)
  )
})

test('getRegistration sends participant edit token', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({ ...mockRegistration, editToken: 'participant-token' }))

  await getRegistration('test-id', 'test-registration-id', 'participant-token')

  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/registration/test-id/test-registration-id`,
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer participant-token' }) })
  )
})

test('postRegistration creates with POST', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'POST'
      ? Promise.resolve(JSON.stringify(mockRegistration))
      : Promise.reject(new Error(`${req.method} !== 'POST'`))
  )

  const result = await postRegistration(mockRegistrationCreateRequest())
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/registration/`, expect.any(Object))
  expect(result.id).not.toBeUndefined()
})

test('patchRegistration updates with PATCH', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'PATCH'
      ? Promise.resolve(JSON.stringify(mockRegistration))
      : Promise.reject(new Error(`${req.method} !== 'PATCH'`))
  )

  const result = await patchRegistration({
    eventId: mockRegistration.eventId,
    id: mockRegistration.id,
    operations: [{ path: ['notes'], type: 'CHANGE', value: 'patched' }],
  })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/registration/`, expect.any(Object))
  expect(result.id).not.toBeUndefined()
})

test('postAdminRegistration creates with POST', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'POST'
      ? Promise.resolve(JSON.stringify(mockRegistration))
      : Promise.reject(new Error(`${req.method} !== 'POST'`))
  )

  const result = await postAdminRegistration(mockRegistrationCreateRequest(), 'test-token')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/registration/`, expect.any(Object))
  expect(result.id).not.toBeUndefined()
})

test('patchAdminRegistration updates with PATCH', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'PATCH'
      ? Promise.resolve(JSON.stringify(mockRegistration))
      : Promise.reject(new Error(`${req.method} !== 'PATCH'`))
  )

  const result = await patchAdminRegistration(
    {
      eventId: mockRegistration.eventId,
      id: mockRegistration.id,
      operations: [{ path: ['notes'], type: 'CHANGE', value: 'patched' }],
    },
    'test-token'
  )
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/registration/`, expect.any(Object))
  expect(result.id).not.toBeUndefined()
})

test('putRegistrationGroups', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'POST'
      ? Promise.resolve(JSON.stringify({ items: [mockRegistration] }))
      : Promise.reject(new Error(`${req.method} !== 'POST'`))
  )

  const { items } = await putRegistrationGroups(
    'test-id',
    [{ group: { key: 'reserve' }, id: mockRegistration.id }],
    'test-token'
  )
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/reg-groups/test-id`, expect.any(Object))
  expect(items).toHaveLength(1)
})

describe('getStartList', () => {
  it('should call correct endpoint', async () => {
    await getStartList('test-id')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/startlist/test-id`, expect.any(Object))
  })

  it('should call authenticated preview endpoint', async () => {
    await getStartListPreview('test-id', 'test-token')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/admin/startlist/test-id`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) })
    )
  })
})
