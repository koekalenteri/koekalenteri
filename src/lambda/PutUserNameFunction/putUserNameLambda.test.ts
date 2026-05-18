import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockGetAndUpdateUserByEmail = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
  getAndUpdateUserByEmail: mockGetAndUpdateUserByEmail,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

const { putUserNameLambda } = await import('./handler')

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
      admin: false,
      email: 'test@example.com',
      id: 'user123',
      name: 'Old Name',
      roles: {},
    })

    mockParseJSONWithFallback.mockReturnValue({
      name: 'Test User',
    })

    mockGetAndUpdateUserByEmail.mockResolvedValue({
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const result = await putUserNameLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
    expect(mockGetAndUpdateUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 400 if name is empty', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      name: '',
    })

    const result = await putUserNameLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(400)
    expect(mockGetAndUpdateUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 400 if name is only whitespace', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      name: '   ',
    })

    const result = await putUserNameLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(400)
    expect(mockGetAndUpdateUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 400 if name is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({})

    const result = await putUserNameLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(400)
    expect(mockGetAndUpdateUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 400 if name is too long', async () => {
    const longName = 'a'.repeat(201)
    mockParseJSONWithFallback.mockReturnValueOnce({
      name: longName,
    })

    const result = await putUserNameLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(400)
    expect(mockGetAndUpdateUserByEmail).not.toHaveBeenCalled()
  })

  it('updates user name successfully', async () => {
    const result = await putUserNameLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: 'Test User' }, true)
    expect(result.statusCode).toBe(200)
  })

  it('trims whitespace from name before updating', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      name: '  Test User  ',
    })

    const result = await putUserNameLambda(event)

    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: 'Test User' }, true)
    expect(result.statusCode).toBe(200)
  })

  it('accepts name at maximum length (200 characters)', async () => {
    const maxLengthName = 'a'.repeat(200)
    mockParseJSONWithFallback.mockReturnValueOnce({
      name: maxLengthName,
    })

    const result = await putUserNameLambda(event)

    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: maxLengthName }, true)
    expect(result.statusCode).toBe(200)
  })

  it('throws an error if getAndUpdateUserByEmail fails', async () => {
    const error = new Error('Database error')
    mockGetAndUpdateUserByEmail.mockRejectedValueOnce(error)

    await expect(putUserNameLambda(event)).rejects.toThrow('Database error')

    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: 'Test User' }, true)
  })
})
