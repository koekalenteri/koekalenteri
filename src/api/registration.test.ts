import type { Registration } from '../types'
import { API_BASE_URL } from '../routeConfig'
import { expectConsoleOutput } from '../test-utils/consoleGuard'
import fetchMock from '../test-utils/fetchMock'
import {
  getRegistration,
  getRegistrations,
  getRegistrationTransactions,
  getStartList,
  getStartListPreview,
  patchAdminRegistration,
  patchRegistration,
  postAdminRegistration,
  postRegistration,
  putEventResults,
  putRegistrationGroups,
} from './registration'

const mockRegistration: Registration = {
  agreeToTerms: true,
  breeder: {
    name: 'test-breeder',
  },
  cancelled: false,
  class: 'AVO',
  createdAt: new Date(),
  createdBy: 'test-user',
  dates: [{ date: '2026-06-01', time: 'ap' }],
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
      date: '2024-01-01',
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

test('postRegistration and patchRegistration use the logged-in route with the id token', async () => {
  fetchMock.mockResponse(JSON.stringify(mockRegistration))

  await postRegistration(mockRegistrationCreateRequest(), 'id-token')
  await patchRegistration(
    { eventId: mockRegistration.eventId, id: mockRegistration.id, operations: [] },
    'edit-token',
    'id-token'
  )

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    `${API_BASE_URL}/user/registration/`,
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer id-token' }), method: 'POST' })
  )
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    `${API_BASE_URL}/user/registration/`,
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer id-token', 'X-Registration-Token': 'edit-token' }),
      method: 'PATCH',
    })
  )
})

test('patchRegistration falls back to the public route when the id token is refused', async () => {
  // The refused call is reported before the fallback is tried; that is the report, not a fault.
  expectConsoleOutput(/reportError .*401/)
  fetchMock.mockResponseOnce('', { status: 401 })
  fetchMock.mockResponseOnce(JSON.stringify(mockRegistration))

  const result = await patchRegistration(
    { eventId: mockRegistration.eventId, id: mockRegistration.id, operations: [] },
    'edit-token',
    'id-token'
  )

  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    `${API_BASE_URL}/registration/`,
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer edit-token' }) })
  )
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    `${API_BASE_URL}/registration/`,
    expect.objectContaining({ headers: expect.not.objectContaining({ 'X-Registration-Token': expect.anything() }) })
  )
  expect(result.id).toBe(mockRegistration.id)
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
    fetchMock.mockResponseOnce(JSON.stringify([]))
    await getStartList('test-id')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/startlist/test-id`, expect.any(Object))
  })

  it('returns the rows with the version their header carries (KOE-1516)', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([]), { headers: { 'X-Start-List-Version': '1234' } })

    await expect(getStartList('test-id')).resolves.toEqual({ participants: [], version: 1234 })
  })

  it('returns no version when the backend sends none', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([]))

    await expect(getStartList('test-id')).resolves.toEqual({ participants: [], version: undefined })
  })

  it('should call authenticated preview endpoint', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([]))
    await getStartListPreview('test-id', 'test-token')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/admin/startlist/test-id`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) })
    )
  })
})

test('getStartList reads the dogs and the placements of the rows (KOE-1546, KOE-1548)', async () => {
  fetchMock.mockResponseOnce(
    JSON.stringify([
      {
        breeder: 'b',
        dog: { dob: '2020-02-02T22:00:00.000Z', name: 'Hukka', regNo: 'FI1/20', results: [] },
        group: { date: '2026-09-11T21:00:00.000Z', key: '2026-09-12-ap', number: 1, time: 'ap' },
        handler: 'h',
        owner: 'o',
      },
    ]),
    { headers: { 'X-Start-List-Version': '7' } }
  )

  const { participants, version } = await getStartList('test-id')

  expect(version).toBe(7)
  // An instant from before the birth date was a day key is read as its Finnish day.
  expect(participants[0].dog.dob).toBe('2020-02-03')
  expect(participants[0].group).toEqual({
    date: '2026-09-12',
    key: '2026-09-12-ap',
    number: 1,
    time: 'ap',
  })
})

test('getRegistrationTransactions makes the stamps of the transactions Dates', async () => {
  fetchMock.mockResponseOnce(
    JSON.stringify([
      {
        amount: 5000,
        createdAt: '2026-05-03T08:00:00.000Z',
        reference: 'ref',
        stamp: 'stamp',
        status: 'ok',
        statusAt: '2026-05-03T08:01:00.000Z',
        transactionId: 't1',
        type: 'payment',
      },
    ])
  )

  const transactions = await getRegistrationTransactions('test-id', 'test-registration-id', 'token')

  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/admin/registration/transactions/test-id/test-registration-id`,
    expect.any(Object)
  )
  expect(transactions?.[0]).toMatchObject({
    createdAt: new Date('2026-05-03T08:00:00.000Z'),
    statusAt: new Date('2026-05-03T08:01:00.000Z'),
    transactionId: 't1',
  })
})

test('putEventResults answers with the results as stored, their stamps Dates', async () => {
  const wireResult = { result: 'ALO1', updatedAt: '2026-09-12T08:05:00.000Z', updatedBy: 'u' }
  fetchMock.mockResponseOnce(
    JSON.stringify({
      conflicts: [{ id: 'r2', stored: wireResult, submitted: wireResult }],
      saved: [{ eventResult: wireResult, id: 'r1' }],
      unchanged: [{ eventResult: wireResult, id: 'r3' }],
    })
  )

  const response = await putEventResults('test-id', [], 'token')

  const modelResult = { result: 'ALO1', updatedAt: new Date('2026-09-12T08:05:00.000Z'), updatedBy: 'u' }
  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/admin/event-results/test-id`,
    expect.objectContaining({ method: 'POST' })
  )
  expect(response).toEqual({
    conflicts: [{ id: 'r2', stored: modelResult, submitted: modelResult }],
    saved: [{ eventResult: modelResult, id: 'r1' }],
    unchanged: [{ eventResult: modelResult, id: 'r3' }],
  })
})
