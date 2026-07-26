import { jest } from '@jest/globals'

const mockAuthorizeWithMemberOf = jest.fn<any>()
const mockGetParam = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockQuery = jest.fn<any>()
const mockFixRegistrationGroups = jest.fn<any>()

jest.unstable_mockModule('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  getParam: mockGetParam,
  LambdaError: class LambdaError extends Error {
    constructor(
      public statusCode: number,
      message: string
    ) {
      super(message)
    }
  },
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    query: mockQuery,
  })),
}))

jest.unstable_mockModule('../lib/event', () => ({
  fixRegistrationGroups: mockFixRegistrationGroups,
  getEvent: mockGetEvent,
}))

const { default: getAdminRegistrationsLambda } = await import('./handler')

describe('getAdminRegistrationsLambda', () => {
  const event = {
    body: '',
    headers: {},
    pathParameters: { eventId: 'event123' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthorizeWithMemberOf.mockResolvedValue({
      memberOf: ['org1'],
      user: { id: 'user1', name: 'Test User' },
    })
    mockGetEvent.mockResolvedValue({ organizer: { id: 'org1' } })
  })

  it('returns 401 if not authorized', async () => {
    const res = { body: 'Unauthorized', statusCode: 401 }
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res })

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).not.toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockFixRegistrationGroups).not.toHaveBeenCalled()
  })

  it('rejects users outside the event organizer before reading registrations', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      memberOf: ['org1'],
      user: { admin: false, id: 'user1', name: 'Test User' },
    })
    mockGetParam.mockReturnValueOnce('event123')
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org2' } })

    await expect(getAdminRegistrationsLambda(event)).rejects.toMatchObject({ message: 'Forbidden', statusCode: 403 })

    expect(mockGetEvent).toHaveBeenCalledWith('event123')
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockFixRegistrationGroups).not.toHaveBeenCalled()
  })

  it('allows admins to read registrations for any organizer', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      memberOf: [],
      user: { admin: true, id: 'admin1', name: 'Admin User' },
    })
    mockGetParam.mockReturnValueOnce('event123')
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org2' } })
    mockQuery.mockResolvedValueOnce([])
    mockFixRegistrationGroups.mockResolvedValueOnce([])

    await getAdminRegistrationsLambda(event)

    expect(mockQuery).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('returns registrations with fixed groups if authorized', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const allRegistrations = [
      { class: 'ALO', eventId, id: 'reg1', state: 'ready' },
      { class: 'ALO', eventId, id: 'reg2', state: 'pending' }, // Should be filtered out
      { class: 'AVO', eventId, id: 'reg3', state: 'ready' },
    ]
    const filteredRegistrations = [
      { class: 'ALO', eventId, id: 'reg1', state: 'ready' },
      { class: 'AVO', eventId, id: 'reg3', state: 'ready' },
    ]
    const registrationsWithGroups = [
      { class: 'ALO', eventId, group: { key: 'ALO', number: 1 }, id: 'reg1', state: 'ready' },
      { class: 'AVO', eventId, group: { key: 'AVO', number: 1 }, id: 'reg3', state: 'ready' },
    ]

    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(allRegistrations)
    mockFixRegistrationGroups.mockResolvedValueOnce(registrationsWithGroups)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockFixRegistrationGroups).toHaveBeenCalledWith(filteredRegistrations, user)
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      registrationsWithGroups.map((registration) => ({ ...registration, editToken: expect.any(String) })),
      event
    )
  })

  it('handles empty query results', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const emptyRegistrations: any[] = []

    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(emptyRegistrations)
    mockFixRegistrationGroups.mockResolvedValueOnce(emptyRegistrations)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockFixRegistrationGroups).toHaveBeenCalledWith(emptyRegistrations, user)
    expect(mockResponse).toHaveBeenCalledWith(200, emptyRegistrations, event)
  })

  it('handles undefined query results', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const emptyRegistrations: any[] = []

    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(undefined)
    mockFixRegistrationGroups.mockResolvedValueOnce(emptyRegistrations)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockFixRegistrationGroups).toHaveBeenCalledWith(emptyRegistrations, user)
    expect(mockResponse).toHaveBeenCalledWith(200, emptyRegistrations, event)
  })

  it('filters out non-ready registrations', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const allRegistrations = [
      { class: 'ALO', eventId, id: 'reg1', state: 'pending' },
      { class: 'ALO', eventId, id: 'reg2', state: 'cancelled' },
      { class: 'AVO', eventId, id: 'reg3', state: 'draft' },
    ]
    const filteredRegistrations: any[] = [] // All registrations are filtered out

    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(allRegistrations)
    mockFixRegistrationGroups.mockResolvedValueOnce(filteredRegistrations)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockFixRegistrationGroups).toHaveBeenCalledWith(filteredRegistrations, user)
    expect(mockResponse).toHaveBeenCalledWith(200, filteredRegistrations, event)
  })

  it('returns changed registrations and deletion tombstones since the requested time', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const eventWithSince = {
      ...event,
      queryStringParameters: { since: String(Date.parse('2026-01-02T00:00:00.000Z')) },
    }
    const allRegistrations = [
      { class: 'ALO', eventId, id: 'reg1', modifiedAt: '2026-01-01T10:00:00.000Z', state: 'ready' },
      { class: 'AVO', eventId, id: 'reg2', modifiedAt: '2026-01-02T10:00:00.000Z', state: 'ready' },
      {
        class: 'VOI',
        eventId,
        id: 'reg3',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        state: 'ready',
        updatedAt: '2026-01-02T10:00:00.000Z',
      },
      { class: 'ALO', eventId, id: 'reg4', state: 'ready' },
      { class: 'ALO', eventId, id: 'reg5', modifiedAt: '2026-01-02T10:00:00.000Z', state: 'cancelled' },
    ]
    const registrationsWithGroups = allRegistrations.slice(0, 4).map((registration) => ({
      ...registration,
      group: { key: registration.class, number: 1 },
    }))
    const changedRegistrationsWithGroups = registrationsWithGroups.slice(1)

    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(allRegistrations)
    mockFixRegistrationGroups.mockResolvedValueOnce(changedRegistrationsWithGroups)

    await getAdminRegistrationsLambda(eventWithSince)

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        cursor: Date.parse('2026-01-02T10:00:00.000Z'),
        deletedIds: ['reg5'],
        items: changedRegistrationsWithGroups.map((registration) => ({
          ...registration,
          editToken: expect.any(String),
        })),
      },
      eventWithSince
    )
  })

  it('passes through errors from query', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const error = new Error('Database error')

    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockRejectedValueOnce(error)

    await expect(getAdminRegistrationsLambda(event)).rejects.toThrow(error)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockFixRegistrationGroups).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('passes through errors from fixRegistrationGroups', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const allRegistrations = [{ class: 'ALO', eventId, id: 'reg1', state: 'ready' }]
    const filteredRegistrations = [{ class: 'ALO', eventId, id: 'reg1', state: 'ready' }]
    const error = new Error('Group fixing error')

    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(allRegistrations)
    mockFixRegistrationGroups.mockRejectedValueOnce(error)

    await expect(getAdminRegistrationsLambda(event)).rejects.toThrow(error)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockFixRegistrationGroups).toHaveBeenCalledWith(filteredRegistrations, user)
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
