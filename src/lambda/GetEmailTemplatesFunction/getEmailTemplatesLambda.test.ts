import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockReadAll = jest.fn<any>()

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    readAll: mockReadAll,
  })),
}))

const { default: getEmailTemplatesLambda } = await import('./handler')

describe('getEmailTemplatesLambda', () => {
  const event = {
    headers: {},
    body: '',
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await getEmailTemplatesLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockReadAll).not.toHaveBeenCalled()
  })

  it('returns all email templates if authorized', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const templates = [
      { id: 'template1', name: 'Template 1', subject: 'Subject 1', body: 'Body 1' },
      { id: 'template2', name: 'Template 2', subject: 'Subject 2', body: 'Body 2' },
    ]

    mockAuthorize.mockResolvedValueOnce(user)
    mockReadAll.mockResolvedValueOnce(templates)

    await getEmailTemplatesLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, templates, event)
  })

  it('returns empty array if no templates found', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const templates: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockReadAll.mockResolvedValueOnce(templates)

    await getEmailTemplatesLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, templates, event)
  })

  it('returns undefined if readAll returns undefined', async () => {
    const user = { id: 'user1', name: 'Test User' }

    mockAuthorize.mockResolvedValueOnce(user)
    mockReadAll.mockResolvedValueOnce(undefined)

    await getEmailTemplatesLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('passes through errors from readAll', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const error = new Error('Database error')

    mockAuthorize.mockResolvedValueOnce(user)
    mockReadAll.mockRejectedValueOnce(error)

    await expect(getEmailTemplatesLambda(event)).rejects.toThrow(error)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
