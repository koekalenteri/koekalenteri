import { API_BASE_URL } from '../routeConfig'
import fetchMock from '../test-utils/fetchMock'
import { getAdminCapacityStats, getAllYearlyStats, getCapacityStats, getOrganizerEventStats } from './stats'

fetchMock.enableMocks()

beforeEach(() => {
  fetchMock.resetMocks()
  fetchMock.enableMocks()
})

test('getAllYearlyStats', async () => {
  const body = { stats: [], years: [] }
  fetchMock.mockResponse((req) =>
    req.method === 'GET' ? Promise.resolve(JSON.stringify(body)) : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const result = await getAllYearlyStats()

  expect(result).toEqual(body)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/stats`, expect.any(Object))
})

test('getCapacityStats sends eventType and date range, never an organizer', async () => {
  const body = { capacityStats: [{ month: '2025-06' }] }
  fetchMock.mockResponse((req) =>
    req.method === 'GET' ? Promise.resolve(JSON.stringify(body)) : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const result = await getCapacityStats('NOME-B', '2025-01', '2025-12')

  expect(result).toEqual(body.capacityStats)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/stats?eventType=NOME-B&from=2025-01&to=2025-12`,
    expect.any(Object)
  )
})

test('getAdminCapacityStats sends token, eventType, organizerId and date range', async () => {
  const body = { capacityStats: [{ month: '2025-06' }] }
  fetchMock.mockResponse((req) =>
    req.method === 'GET' ? Promise.resolve(JSON.stringify(body)) : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const result = await getAdminCapacityStats('token', 'NOME-B', 'organizer-1', '2025-01', '2025-12')

  expect(result).toEqual(body.capacityStats)
  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/admin/stats?eventType=NOME-B&organizerId=organizer-1&from=2025-01&to=2025-12`,
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) })
  )
})

test('getCapacityStats without a date range', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({}))

  const result = await getCapacityStats('NOU')

  expect(result).toEqual([])
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/stats?eventType=NOU`, expect.any(Object))
})

test('getOrganizerEventStats sends token, organizerId and date range', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET' ? Promise.resolve(JSON.stringify([])) : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  await getOrganizerEventStats('test-token', 'org1', '2024-01-01', '2024-12-31')

  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/admin/stats?organizerId=org1&from=2024-01-01&to=2024-12-31`,
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    })
  )
})

test('getOrganizerEventStats without organizerId or date range', async () => {
  fetchMock.mockResponseOnce(JSON.stringify([]))

  await getOrganizerEventStats('test-token')

  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/stats`, expect.any(Object))
})
