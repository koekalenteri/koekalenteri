import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn()
const mockFilterRelevantUsers = jest.fn()
const mockGetAllUsers = jest.fn<any>()
const mockUserIsMemberOf = jest.fn<any>()

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))
jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))
jest.unstable_mockModule('../lib/user', () => ({
  filterRelevantUsers: mockFilterRelevantUsers,
  getAllUsers: mockGetAllUsers,
  userIsMemberOf: mockUserIsMemberOf,
}))

const { default: getUsersHandler } = await import('./handler')

describe('getUsersHandler', () => {
  const event = { headers: {}, body: '' } as any
  let errorSpy: jest.SpiedFunction<any>

  beforeAll(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterAll(() => {
    errorSpy.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)
    await getUsersHandler(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
  })

  it('returns 403 if user is not admin or member of any organizations', async () => {
    const user = { id: 'user1', admin: false }
    mockAuthorize.mockResolvedValueOnce(user)
    mockUserIsMemberOf.mockReturnValueOnce([])
    await getUsersHandler(event)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(errorSpy).toHaveBeenCalledWith('User user1 is not admin or member of any organizations.')
  })

  it('returns 200 and filtered users if authorized and member/admin', async () => {
    const user = { id: 'user2', admin: false }
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
    const user = { id: 'admin', admin: true }
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
})
