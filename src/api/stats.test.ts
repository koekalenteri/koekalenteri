import { API_BASE_URL } from '../routeConfig'
import fetchMock from '../test-utils/fetchMock'
import { getAllYearlyStats, getOrganizerEventStats, getYearlyStats } from './stats'

fetchMock.enableMocks()

beforeEach(() => {
  fetchMock.resetMocks()
  fetchMock.enableMocks()
})

test('getYearlyStats', async () => {
  const body = {
    breedBreakdown: [],
    dogHandlerBuckets: [],
    eventTypeBreakdown: [],
    totals: [],
    year: 2024,
  }
  fetchMock.mockResponse((req) =>
    req.method === 'GET' ? Promise.resolve(JSON.stringify(body)) : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const result = await getYearlyStats(2024)

  expect(result).toEqual(body)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/yearly-stats?year=2024`, expect.any(Object))
})

test('getAllYearlyStats', async () => {
  const body = { stats: [], years: [] }
  fetchMock.mockResponse((req) =>
    req.method === 'GET' ? Promise.resolve(JSON.stringify(body)) : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const result = await getAllYearlyStats()

  expect(result).toEqual(body)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/yearly-stats`, expect.any(Object))
})

test('getOrganizerEventStats sends token, organizerId and date range', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET' ? Promise.resolve(JSON.stringify([])) : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  await getOrganizerEventStats('test-token', 'org1', '2024-01-01', '2024-12-31')

  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/admin/organizer-event-stats?organizerId=org1&from=2024-01-01&to=2024-12-31`,
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    })
  )
})

test('getOrganizerEventStats without organizerId or date range', async () => {
  fetchMock.mockResponseOnce(JSON.stringify([]))

  await getOrganizerEventStats('test-token')

  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/organizer-event-stats`, expect.any(Object))
})
