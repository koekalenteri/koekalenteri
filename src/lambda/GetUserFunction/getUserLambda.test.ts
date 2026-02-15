import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>()

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

const { default: getUserLambda } = await import('./handler')

describe('getUserLambda', () => {
  const event = {
    body: '',
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await getUserLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event, true)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
  })

  it('returns user if authorized', async () => {
    const user = {
      admin: false,
      email: 'test@example.com',
      id: 'user1',
      name: 'Test User',
    }

    mockAuthorize.mockResolvedValueOnce(user)

    await getUserLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event, true)
    expect(mockResponse).toHaveBeenCalledWith(200, user, event)
  })

  it('passes through errors from authorize', async () => {
    const error = new Error('Authorization error')

    mockAuthorize.mockRejectedValueOnce(error)

    await expect(getUserLambda(event)).rejects.toThrow(error)

    expect(mockAuthorize).toHaveBeenCalledWith(event, true)
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
