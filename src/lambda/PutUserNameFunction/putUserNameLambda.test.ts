import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockGetAndUpdateUserByEmail = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
  getAndUpdateUserByEmail: mockGetAndUpdateUserByEmail,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

const { default: putUserNameLambda } = await import('./handler')

describe('putUserNameLambda', () => {
  const event = {
    body: JSON.stringify({
      name: 'Test User',
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      id: 'user123',
      email: 'test@example.com',
      name: 'Old Name',
      admin: false,
      roles: {},
    })

    mockParseJSONWithFallback.mockReturnValue({
      name: 'Test User',
    })

    mockGetAndUpdateUserByEmail.mockResolvedValue({
      id: 'user123',
      email: 'test@example.com',
      name: 'Test User',
    })
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await putUserNameLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockGetAndUpdateUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 400 if name is empty', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      name: '',
    })

    await putUserNameLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(400, 'Bad request', event)
    expect(mockGetAndUpdateUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 400 if name is only whitespace', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      name: '   ',
    })

    await putUserNameLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(400, 'Bad request', event)
    expect(mockGetAndUpdateUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 400 if name is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({})

    await putUserNameLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(400, 'Bad request', event)
    expect(mockGetAndUpdateUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 400 if name is too long', async () => {
    const longName = 'a'.repeat(201)
    mockParseJSONWithFallback.mockReturnValueOnce({
      name: longName,
    })

    await putUserNameLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(400, 'Bad request', event)
    expect(mockGetAndUpdateUserByEmail).not.toHaveBeenCalled()
  })

  it('updates user name successfully', async () => {
    await putUserNameLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: 'Test User' }, true)
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
      },
      event
    )
  })

  it('trims whitespace from name before updating', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      name: '  Test User  ',
    })

    await putUserNameLambda(event)

    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: 'Test User' }, true)
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(Object), event)
  })

  it('accepts name at maximum length (200 characters)', async () => {
    const maxLengthName = 'a'.repeat(200)
    mockParseJSONWithFallback.mockReturnValueOnce({
      name: maxLengthName,
    })

    await putUserNameLambda(event)

    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: maxLengthName }, true)
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(Object), event)
  })

  it('throws an error if getAndUpdateUserByEmail fails', async () => {
    const error = new Error('Database error')
    mockGetAndUpdateUserByEmail.mockRejectedValueOnce(error)

    await expect(putUserNameLambda(event)).rejects.toThrow('Database error')

    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: 'Test User' }, true)
  })
})
