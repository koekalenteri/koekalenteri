import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockAuthorizeWithMemberOf = vi.fn()
const mockGetParam = vi.fn()
const mockGetEvent = vi.fn()
const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockLambdaError = vi.fn()

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

vi.doMock('../lib/lambda', () => ({
  getParam: mockGetParam,
  LambdaError: mockLambdaError,
  lambda: mockLambda,
  response: mockResponse,
}))

const { default: getAdminEventLambda } = await import('./handler')

describe('getAdminEventLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: '',
    headers: {},
    pathParameters: { id: 'event123' },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockLambdaError.mockImplementation(function MockLambdaError(code: number, message: string) {
      const error = new Error(message) as Error & { statusCode: number }
      error.statusCode = code
      return error
    })
  })

  it('returns response from authorizeWithMemberOf if it exists', async () => {
    const res = { body: 'Unauthorized', statusCode: 401 }
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res })

    await getAdminEventLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).not.toHaveBeenCalled()
    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('returns event for admin user', async () => {
    const user = { admin: true, id: 'admin1' }
    const memberOf = ['org1']
    const eventId = 'event123'
    const eventItem = {
      id: eventId,
      name: 'Test Event',
      organizer: { id: 'org2' }, // Different org than user is member of
    }

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(eventItem)

    await getAdminEventLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockResponse).toHaveBeenCalledWith(200, eventItem, event)
  })

  it('returns event for user who is member of the event organizer', async () => {
    const user = { admin: false, id: 'user1' }
    const memberOf = ['org1', 'org3']
    const eventId = 'event123'
    const eventItem = {
      id: eventId,
      name: 'Test Event',
      organizer: { id: 'org3' }, // User is member of this org
    }

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(eventItem)

    await getAdminEventLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockResponse).toHaveBeenCalledWith(200, eventItem, event)
  })

  it('throws 403 error for non-admin user who is not member of the event organizer', async () => {
    const user = { admin: false, id: 'user1' }
    const memberOf = ['org1', 'org2']
    const eventId = 'event123'
    const eventItem = {
      id: eventId,
      name: 'Test Event',
      organizer: { id: 'org3' }, // User is not member of this org
    }

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(eventItem)

    await expect(getAdminEventLambda(event)).rejects.toEqual(
      expect.objectContaining({
        message: 'Forbidden',
        statusCode: 403,
      })
    )

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('passes through errors from getEvent', async () => {
    const user = { admin: true, id: 'admin1' }
    const memberOf = ['org1']
    const eventId = 'nonexistent'
    const error = new Error('Event not found')

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockRejectedValueOnce(error)

    await expect(getAdminEventLambda(event)).rejects.toThrow(error)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('handles missing event ID parameter', async () => {
    const user = { admin: true, id: 'admin1' }
    const memberOf = ['org1']

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockGetParam.mockReturnValueOnce(undefined)

    await getAdminEventLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetEvent).toHaveBeenCalledWith(undefined)
    // The function will still try to get the event with undefined ID
    // and the error handling will be done in the getEvent function
  })
})
