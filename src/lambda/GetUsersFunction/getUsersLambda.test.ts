import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockFilterRelevantUsers = jest.fn()
const mockGetAllUsers = jest.fn<any>()
const mockUserIsMemberOf = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))
jest.unstable_mockModule('../lib/user', () => ({
  filterRelevantUsers: mockFilterRelevantUsers,
  getAllUsers: mockGetAllUsers,
  userIsMemberOf: mockUserIsMemberOf,
}))

const { getUsersLambda } = await import('./handler')

describe('getUsersLambda', () => {
  const event = { body: '', headers: {} } as any
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
    const result = await getUsersLambda(event)
    expect(result.statusCode).toBe(401)
  })

  it('returns 403 if user is not admin or member of any organizations', async () => {
    const user = { admin: false, id: 'user1' }
    mockAuthorize.mockResolvedValueOnce(user)
    mockUserIsMemberOf.mockReturnValueOnce([])
    const result = await getUsersLambda(event)
    expect(result.statusCode).toBe(403)
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
    const result = await getUsersLambda(event)
    expect(result.statusCode).toBe(200)
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
    const result = await getUsersLambda(event)
    expect(result.statusCode).toBe(200)
  })
})
