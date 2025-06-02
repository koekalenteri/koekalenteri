import { jest } from '@jest/globals'

const mockAuthorizeWithMemberOf = jest.fn<any>()
const mockGetParam = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockLambdaError = jest.fn<any>()

jest.unstable_mockModule('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  getParam: mockGetParam,
  lambda: mockLambda,
  response: mockResponse,
  LambdaError: mockLambdaError,
}))

const { default: getAdminEventLambda } = await import('./handler')

describe('getAdminEventLambda', () => {
  const event = {
    headers: {},
    body: '',
    pathParameters: { id: 'event123' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
    mockLambdaError.mockImplementation((code: number, message: string) => {
      const error = new Error(message) as Error & { statusCode: number }
      error.statusCode = code
      return error
    })
  })

  it('returns response from authorizeWithMemberOf if it exists', async () => {
    const res = { statusCode: 401, body: 'Unauthorized' }
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res })

    await getAdminEventLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).not.toHaveBeenCalled()
    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('returns event for admin user', async () => {
    const user = { id: 'admin1', admin: true }
    const memberOf = ['org1']
    const eventId = 'event123'
    const eventItem = {
      id: eventId,
      name: 'Test Event',
      organizer: { id: 'org2' }, // Different org than user is member of
    }

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ user, memberOf })
    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(eventItem)

    await getAdminEventLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockResponse).toHaveBeenCalledWith(200, eventItem, event)
  })

  it('returns event for user who is member of the event organizer', async () => {
    const user = { id: 'user1', admin: false }
    const memberOf = ['org1', 'org3']
    const eventId = 'event123'
    const eventItem = {
      id: eventId,
      name: 'Test Event',
      organizer: { id: 'org3' }, // User is member of this org
    }

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ user, memberOf })
    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(eventItem)

    await getAdminEventLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockResponse).toHaveBeenCalledWith(200, eventItem, event)
  })

  it('throws 403 error for non-admin user who is not member of the event organizer', async () => {
    const user = { id: 'user1', admin: false }
    const memberOf = ['org1', 'org2']
    const eventId = 'event123'
    const eventItem = {
      id: eventId,
      name: 'Test Event',
      organizer: { id: 'org3' }, // User is not member of this org
    }

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ user, memberOf })
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
    const user = { id: 'admin1', admin: true }
    const memberOf = ['org1']
    const eventId = 'nonexistent'
    const error = new Error('Event not found')

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ user, memberOf })
    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockRejectedValueOnce(error)

    await expect(getAdminEventLambda(event)).rejects.toThrow(error)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('handles missing event ID parameter', async () => {
    const user = { id: 'admin1', admin: true }
    const memberOf = ['org1']

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ user, memberOf })
    mockGetParam.mockReturnValueOnce(undefined)

    await getAdminEventLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetEvent).toHaveBeenCalledWith(undefined)
    // The function will still try to get the event with undefined ID
    // and the error handling will be done in the getEvent function
  })
})
