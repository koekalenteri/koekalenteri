import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockAuthorizeWithMemberOf = vi.fn()
const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockReadAll = vi.fn()

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

vi.doMock('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      readAll: mockReadAll,
    }
  }),
}))

const { default: getEmailTemplatesLambda } = await import('./handler')

describe('getEmailTemplatesLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: '',
    headers: {},
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1'], user: { id: 'user1', name: 'Test User' } })
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res: { body: 'Unauthorized', statusCode: 401 } })

    await getEmailTemplatesLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockReadAll).not.toHaveBeenCalled()
  })

  it('returns 403 if the user is neither an admin nor an organizer member', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res: { body: 'Forbidden', statusCode: 403 } })

    await getEmailTemplatesLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockReadAll).not.toHaveBeenCalled()
  })

  it('returns all email templates if authorized', async () => {
    const templates = [
      { body: 'Body 1', id: 'template1', name: 'Template 1', subject: 'Subject 1' },
      { body: 'Body 2', id: 'template2', name: 'Template 2', subject: 'Subject 2' },
    ]

    mockReadAll.mockResolvedValueOnce(templates)

    await getEmailTemplatesLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, templates, event)
  })

  it('returns empty array if no templates found', async () => {
    const templates: any[] = []

    mockReadAll.mockResolvedValueOnce(templates)

    await getEmailTemplatesLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, templates, event)
  })

  it('returns only email templates changed since the requested time', async () => {
    const incrementalEvent = { ...event, queryStringParameters: { since: '1704153600000' } }
    const templates = [
      { id: 'old', modifiedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'new', modifiedAt: '2024-01-03T00:00:00.000Z' },
    ]
    mockReadAll.mockResolvedValueOnce(templates)

    await getEmailTemplatesLambda(incrementalEvent)

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        cursor: Date.parse('2024-01-03T00:00:00.000Z'),
        deletedIds: [],
        items: [{ id: 'new', modifiedAt: '2024-01-03T00:00:00.000Z' }],
      },
      incrementalEvent
    )
  })

  it('returns undefined if readAll returns undefined', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await getEmailTemplatesLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('passes through errors from readAll', async () => {
    const error = new Error('Database error')

    mockReadAll.mockRejectedValueOnce(error)

    await expect(getEmailTemplatesLambda(event)).rejects.toThrow(error)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
