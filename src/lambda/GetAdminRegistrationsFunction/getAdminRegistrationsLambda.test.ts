import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockAuthorizeWithMemberOf = vi.fn()
const mockGetParam = vi.fn()
const mockGetEvent = vi.fn()
const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockQuery = vi.fn()

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

vi.doMock('../lib/lambda', () => ({
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

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      query: mockQuery,
    }
  }),
}))

vi.doMock('../lib/event', () => ({ getEvent: mockGetEvent }))

const { default: getAdminRegistrationsLambda } = await import('./handler')

describe('getAdminRegistrationsLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: '',
    headers: {},
    pathParameters: { eventId: 'event123' },
  })

  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  it('allows admins to read registrations for any organizer', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      memberOf: [],
      user: { admin: true, id: 'admin1', name: 'Admin User' },
    })
    mockGetParam.mockReturnValueOnce('event123')
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org2' } })
    mockQuery.mockResolvedValueOnce([])

    await getAdminRegistrationsLambda(event)

    expect(mockQuery).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('returns stored registrations without mutating their groups if authorized', async () => {
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
    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(allRegistrations)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      filteredRegistrations.map((registration) => ({ ...registration, editToken: expect.any(String) })),
      event
    )
  })

  it('handles empty query results', async () => {
    const eventId = 'event123'
    const emptyRegistrations: any[] = []

    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(emptyRegistrations)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, emptyRegistrations, event)
  })

  it('handles undefined query results', async () => {
    const eventId = 'event123'
    const emptyRegistrations: any[] = []

    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(undefined)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, emptyRegistrations, event)
  })

  it('filters out non-ready registrations', async () => {
    const eventId = 'event123'
    const allRegistrations = [
      { class: 'ALO', eventId, id: 'reg1', state: 'pending' },
      { class: 'ALO', eventId, id: 'reg2', state: 'cancelled' },
      { class: 'AVO', eventId, id: 'reg3', state: 'draft' },
    ]
    const filteredRegistrations: any[] = [] // All registrations are filtered out

    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(allRegistrations)

    await getAdminRegistrationsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, filteredRegistrations, event)
  })

  it('returns changed registrations and deletion tombstones since the requested time', async () => {
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
    const changedRegistrations = allRegistrations.slice(1, 4)

    mockGetParam.mockReturnValueOnce(eventId)
    mockQuery.mockResolvedValueOnce(allRegistrations)

    await getAdminRegistrationsLambda(eventWithSince)

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        cursor: Date.parse('2026-01-02T10:00:00.000Z'),
        deletedIds: ['reg5'],
        items: changedRegistrations.map((registration) => ({
          ...registration,
          editToken: expect.any(String),
        })),
      },
      eventWithSince
    )
  })

  it('passes through errors from query', async () => {
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
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
