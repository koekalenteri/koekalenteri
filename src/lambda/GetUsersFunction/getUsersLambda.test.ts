import { vi } from 'vitest'

const mockAuthorize = vi.fn()
const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockDedupeUsersByEmail = vi.fn((users: any[]) => users)
const mockFilterRelevantUsers = vi.fn()
const mockGetAllUsers = vi.fn()
const mockUserIsMemberOf = vi.fn()

vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
}))
vi.doMock('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))
vi.doMock('../lib/user', () => ({
  dedupeUsersByEmail: mockDedupeUsersByEmail,
  filterRelevantUsers: mockFilterRelevantUsers,
  getAllUsers: mockGetAllUsers,
  userIsMemberOf: mockUserIsMemberOf,
}))

const { default: getUsersHandler } = await import('./handler')

describe('getUsersHandler', () => {
  const event = { body: '', headers: {} } as any
  let errorSpy: import('vitest').MockInstance<any>

  beforeAll(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterAll(() => {
    errorSpy.mockRestore()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)
    await getUsersHandler(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
  })

  it('returns 403 if user is not admin or member of any organizations', async () => {
    const user = { admin: false, id: 'user1' }
    mockAuthorize.mockResolvedValueOnce(user)
    mockUserIsMemberOf.mockReturnValueOnce([])
    await getUsersHandler(event)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(errorSpy).toHaveBeenCalledWith('User user1 is not admin or member of any organizations.')
  })

  it('returns 200 and filtered users if authorized and member/admin', async () => {
    const user = { admin: false, id: 'user2' }
    const memberOf = ['org1']
    const users = [{ id: 'a' }, { id: 'b' }]
    const filtered = [{ id: 'a' }]
    mockAuthorize.mockResolvedValueOnce(user)
    mockUserIsMemberOf.mockReturnValueOnce(memberOf)
    mockGetAllUsers.mockResolvedValueOnce(users)
    mockFilterRelevantUsers.mockReturnValueOnce(filtered)
    await getUsersHandler(event)
    expect(mockResponse).toHaveBeenCalledWith(200, filtered, event)
  })

  it('returns 200 and filtered users if user is admin', async () => {
    const user = { admin: true, id: 'admin' }
    const memberOf: any[] = []
    const users = [{ id: 'a' }, { id: 'b' }]
    const filtered = [{ id: 'b' }]
    mockAuthorize.mockResolvedValueOnce(user)
    mockUserIsMemberOf.mockReturnValueOnce(memberOf)
    mockGetAllUsers.mockResolvedValueOnce(users)
    mockFilterRelevantUsers.mockReturnValueOnce(filtered)
    await getUsersHandler(event)
    expect(mockResponse).toHaveBeenCalledWith(200, filtered, event)
  })

  it('returns changed relevant users and tombstones since the requested time', async () => {
    const incrementalEvent = { ...event, queryStringParameters: { since: '1704153600000' } }
    const users = [
      { id: 'unchanged', modifiedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'changed', modifiedAt: '2024-01-03T00:00:00.000Z' },
      { id: 'removed', modifiedAt: '2024-01-03T00:00:00.000Z' },
    ]
    mockAuthorize.mockResolvedValueOnce({ admin: true, id: 'admin' })
    mockUserIsMemberOf.mockReturnValueOnce([])
    mockGetAllUsers.mockResolvedValueOnce(users)
    mockFilterRelevantUsers.mockReturnValueOnce([users[0], users[1]])

    await getUsersHandler(incrementalEvent)

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      { cursor: Date.parse('2024-01-03T00:00:00.000Z'), deletedIds: ['removed'], items: [users[1]] },
      incrementalEvent
    )
  })
})
