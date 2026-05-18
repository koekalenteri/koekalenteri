import { jest } from '@jest/globals'

const mockAuthorizeWithMemberOf = jest.fn<any>()
const mockGetById = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

jest.unstable_mockModule('../event/repository', () => ({
  eventRepository: {
    getById: mockGetById,
  },
}))

const { getAdminEventLambda } = await import('./handler')

describe('getAdminEventLambda', () => {
  const event = {
    body: '',
    headers: {},
    pathParameters: { id: 'event123' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns response from authorizeWithMemberOf if it exists', async () => {
    const res = { body: 'Unauthorized', statusCode: 401 }
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res })

    const result = await getAdminEventLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetById).not.toHaveBeenCalled()
    expect(result).toEqual(res)
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
    mockGetById.mockResolvedValueOnce(eventItem)

    const result = await getAdminEventLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetById).toHaveBeenCalledWith(eventId)
    expect(result.statusCode).toBe(200)
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
    mockGetById.mockResolvedValueOnce(eventItem)

    const result = await getAdminEventLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetById).toHaveBeenCalledWith(eventId)
    expect(result.statusCode).toBe(200)
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
    mockGetById.mockResolvedValueOnce(eventItem)

    await expect(getAdminEventLambda(event)).rejects.toThrow('403 Forbidden')

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetById).toHaveBeenCalledWith(eventId)
  })

  it('passes through errors from eventRepository.getById', async () => {
    const user = { admin: true, id: 'admin1' }
    const memberOf = ['org1']
    const eventId = 'event123'
    const error = new Error('Event not found')

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockGetById.mockRejectedValueOnce(error)

    await expect(getAdminEventLambda(event)).rejects.toThrow(error)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetById).toHaveBeenCalledWith(eventId)
  })

  it('handles missing event ID parameter', async () => {
    const user = { admin: true, id: 'admin1' }
    const memberOf = ['org1']

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    // getById returns undefined for id from event.pathParameters
    mockGetById.mockResolvedValueOnce(undefined)

    await expect(getAdminEventLambda(event)).rejects.toThrow("404 Event with id 'event123' was not found")

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetById).toHaveBeenCalledWith('event123')
  })
})
