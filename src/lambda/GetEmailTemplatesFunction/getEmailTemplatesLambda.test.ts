import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockReadAll = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../emailTemplate/repository', () => ({
  emailTemplateRepository: {
    readAll: mockReadAll,
  },
}))

const { getEmailTemplatesLambda } = await import('./handler')

describe('getEmailTemplatesLambda', () => {
  const event = {
    body: '',
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const result = await getEmailTemplatesLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
    expect(JSON.parse(result.body)).toBe('Unauthorized')
    expect(mockReadAll).not.toHaveBeenCalled()
  })

  it('returns all email templates if authorized', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const templates = [
      { body: 'Body 1', id: 'template1', name: 'Template 1', subject: 'Subject 1' },
      { body: 'Body 2', id: 'template2', name: 'Template 2', subject: 'Subject 2' },
    ]

    mockAuthorize.mockResolvedValueOnce(user)
    mockReadAll.mockResolvedValueOnce(templates)

    const result = await getEmailTemplatesLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockReadAll).toHaveBeenCalled()
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(templates)
  })

  it('returns empty array if no templates found', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const templates: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockReadAll.mockResolvedValueOnce(templates)

    const result = await getEmailTemplatesLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockReadAll).toHaveBeenCalled()
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(templates)
  })

  it('returns undefined if readAll returns undefined', async () => {
    const user = { id: 'user1', name: 'Test User' }

    mockAuthorize.mockResolvedValueOnce(user)
    mockReadAll.mockResolvedValueOnce(undefined)

    const result = await getEmailTemplatesLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockReadAll).toHaveBeenCalled()
    expect(result.statusCode).toBe(200)
    expect(result.body).toBeUndefined()
  })

  it('passes through errors from readAll', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const error = new Error('Database error')

    mockAuthorize.mockResolvedValueOnce(user)
    mockReadAll.mockRejectedValueOnce(error)

    await expect(getEmailTemplatesLambda(event)).rejects.toThrow(error)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockReadAll).toHaveBeenCalled()
  })
})
