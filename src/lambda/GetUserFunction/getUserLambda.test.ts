import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockGetDataVersions = jest.fn<any>()
const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>()

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/dataVersions', () => ({
  getDataVersions: mockGetDataVersions,
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
    expect(mockGetDataVersions).not.toHaveBeenCalled()
  })

  it('returns user if authorized', async () => {
    const user = {
      admin: true,
      email: 'test@example.com',
      id: 'user1',
      name: 'Test User',
    }
    const dataVersions = {
      emailTemplates: { count: 10, modifiedAt: '2026-01-00T00:00:00.000Z' },
      eventTypes: { count: 1, modifiedAt: '2026-01-01T00:00:00.000Z' },
      judges: { count: 2, modifiedAt: '2026-01-02T00:00:00.000Z' },
      officials: { count: 3, modifiedAt: '2026-01-03T00:00:00.000Z' },
      users: { count: 4, modifiedAt: '2026-01-04T00:00:00.000Z' },
    }

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetDataVersions.mockResolvedValueOnce(dataVersions)

    await getUserLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event, true)
    expect(mockGetDataVersions).toHaveBeenCalledWith(user)
    expect(mockResponse).toHaveBeenCalledWith(200, { ...user, dataVersions }, event)
  })

  it('does not return dataVersions for users without admin access', async () => {
    const user = {
      admin: false,
      email: 'test@example.com',
      id: 'user1',
      name: 'Test User',
      roles: {},
    }

    mockAuthorize.mockResolvedValueOnce(user)

    await getUserLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event, true)
    expect(mockGetDataVersions).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, { ...user, dataVersions: undefined }, event)
  })

  it('passes through errors from authorize', async () => {
    const error = new Error('Authorization error')

    mockAuthorize.mockRejectedValueOnce(error)

    await expect(getUserLambda(event)).rejects.toThrow(error)

    expect(mockAuthorize).toHaveBeenCalledWith(event, true)
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
