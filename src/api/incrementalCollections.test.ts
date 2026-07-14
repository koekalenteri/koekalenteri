import fetchMock from 'jest-fetch-mock'
import { API_BASE_URL } from '../routeConfig'
import { getEmailTemplates } from './email'
import { getEventTypes } from './eventType'
import { getJudges } from './judge'
import { getOfficials } from './official'
import { getUsers } from './user'

fetchMock.enableMocks()

describe('incremental admin collections', () => {
  beforeEach(() => {
    fetchMock.resetMocks()
    fetchMock.mockResponse(JSON.stringify({ cursor: 123, deletedIds: [], items: [] }))
  })

  it('sends since to every supported collection endpoint', async () => {
    const since = new Date(123)

    await getUsers('token', undefined, since)
    await getJudges('token', false, undefined, since)
    await getOfficials('token', false, undefined, since)
    await getEventTypes('token', false, undefined, since)
    await getEmailTemplates('token', undefined, since)

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${API_BASE_URL}/admin/user?since=123`,
      `${API_BASE_URL}/admin/judge/?since=123`,
      `${API_BASE_URL}/admin/official/?since=123`,
      `${API_BASE_URL}/admin/eventType/?since=123`,
      `${API_BASE_URL}/admin/email-templates?since=123`,
    ])
  })

  it('combines refresh and since parameters', async () => {
    await getJudges('token', true, undefined, new Date(123))

    expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/admin/judge/?refresh&since=123`)
  })
})
