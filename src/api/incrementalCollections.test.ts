import { API_BASE_URL } from '../routeConfig'
import fetchMock from '../test-utils/fetchMock'
import { getEmailTemplates } from './email'
import { getEventTypes } from './eventType'
import { getJudges } from './judge'
import { getOfficials } from './official'
import { getUsers } from './user'

fetchMock.enableMocks()

describe('incremental admin collections', () => {
  beforeEach(() => {
    fetchMock.resetMocks()
    fetchMock.enableMocks()
    fetchMock.mockResponse(JSON.stringify({ cursor: 123, deletedIds: [], items: [] }))
  })

  it('sends since to every supported collection endpoint', async () => {
    const since = new Date(123)

    await getUsers('token', undefined, since)
    await getJudges('token', false, undefined, since)
    await getOfficials('token', false, undefined, since)
    await getEventTypes('token', false, undefined, since)
    await getEmailTemplates('token', undefined, since)

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/admin/user?since=123`, expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${API_BASE_URL}/admin/judge/?since=123`, expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(3, `${API_BASE_URL}/admin/official/?since=123`, expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(4, `${API_BASE_URL}/admin/eventType/?since=123`, expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(5, `${API_BASE_URL}/admin/email-templates?since=123`, expect.any(Object))
  })

  it('combines refresh and since parameters', async () => {
    await getJudges('token', true, undefined, new Date(123))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/judge/?refresh&since=123`, expect.any(Object))
  })
})
