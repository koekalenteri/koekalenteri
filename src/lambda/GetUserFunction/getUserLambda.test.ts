import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))

const { getUserLambda } = await import('./handler')

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

    const result = await getUserLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event, true)
    expect(result.statusCode).toBe(401)
  })

  it('returns user if authorized', async () => {
    const user = {
      admin: false,
      email: 'test@example.com',
      id: 'user1',
      name: 'Test User',
    }

    mockAuthorize.mockResolvedValueOnce(user)

    const result = await getUserLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event, true)
    expect(result.statusCode).toBe(200)
  })

  it('passes through errors from authorize', async () => {
    const error = new Error('Authorization error')

    mockAuthorize.mockRejectedValueOnce(error)

    await expect(getUserLambda(event)).rejects.toThrow(error)

    expect(mockAuthorize).toHaveBeenCalledWith(event, true)
  })
})
