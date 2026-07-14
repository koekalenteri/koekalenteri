import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockGetParam = jest.fn<any>()
const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockQuery = jest.fn<any>()
const mockFixRegistrationGroups = jest.fn<any>()

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
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
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockGetParam).not.toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockFixRegistrationGroups).not.toHaveBeenCalled()
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

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(allRegistrations)
    mockFixRegistrationGroups.mockResolvedValueOnce(registrationsWithGroups)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockFixRegistrationGroups).toHaveBeenCalledWith(filteredRegistrations, user)
    expect(mockResponse).toHaveBeenCalledWith(200, registrationsWithGroups, event)
  })

  it('handles empty query results', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const emptyRegistrations: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(emptyRegistrations)
    mockFixRegistrationGroups.mockResolvedValueOnce(emptyRegistrations)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
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

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(undefined)
    mockFixRegistrationGroups.mockResolvedValueOnce(emptyRegistrations)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
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

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(allRegistrations)
    mockFixRegistrationGroups.mockResolvedValueOnce(filteredRegistrations)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
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

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(allRegistrations)
    mockFixRegistrationGroups.mockResolvedValueOnce(changedRegistrationsWithGroups)

    await getAdminRegistrationsLambda(eventWithSince)

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        cursor: Date.parse('2026-01-02T10:00:00.000Z'),
        deletedIds: ['reg5'],
        items: changedRegistrationsWithGroups,
      },
      eventWithSince
    )
  })

  it('passes through errors from query', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const error = new Error('Database error')

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockRejectedValueOnce(error)

    await expect(getAdminRegistrationsLambda(event)).rejects.toThrow(error)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
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

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(allRegistrations)
    mockFixRegistrationGroups.mockRejectedValueOnce(error)

    await expect(getAdminRegistrationsLambda(event)).rejects.toThrow(error)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockFixRegistrationGroups).toHaveBeenCalledWith(filteredRegistrations, user)
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
