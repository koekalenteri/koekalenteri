import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockGetRegistrationsByEventId = jest.fn<any>()
const mockFixRegistrationGroups = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/registration', () => ({
  getRegistrationsByEventId: mockGetRegistrationsByEventId,
}))

jest.unstable_mockModule('../registration/groups', () => ({
  fixRegistrationGroups: mockFixRegistrationGroups,
  formatGroupAuditInfo: jest.fn(),
  saveGroup: jest.fn(),
}))

const { getAdminRegistrationsLambda } = await import('./handler')

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
    expect(mockGetRegistrationsByEventId).not.toHaveBeenCalled()
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
    mockGetRegistrationsByEventId.mockResolvedValueOnce(allRegistrations)
    mockFixRegistrationGroups.mockResolvedValueOnce(registrationsWithGroups)

    const result = await getAdminRegistrationsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetRegistrationsByEventId).toHaveBeenCalledWith(eventId)
    expect(mockFixRegistrationGroups).toHaveBeenCalledWith(filteredRegistrations, user)
    expect(result.statusCode).toBe(200)
  })

  it('handles empty query results', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const emptyRegistrations: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetRegistrationsByEventId.mockResolvedValueOnce(emptyRegistrations)
    mockFixRegistrationGroups.mockResolvedValueOnce(emptyRegistrations)

    const result = await getAdminRegistrationsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetRegistrationsByEventId).toHaveBeenCalledWith(eventId)
    expect(mockFixRegistrationGroups).toHaveBeenCalledWith(emptyRegistrations, user)
    expect(result.statusCode).toBe(200)
  })

  it('handles undefined query results', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const emptyRegistrations: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetRegistrationsByEventId.mockResolvedValueOnce(undefined)
    mockFixRegistrationGroups.mockResolvedValueOnce(emptyRegistrations)

    const result = await getAdminRegistrationsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetRegistrationsByEventId).toHaveBeenCalledWith(eventId)
    expect(mockFixRegistrationGroups).toHaveBeenCalledWith(emptyRegistrations, user)
    expect(result.statusCode).toBe(200)
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
    mockGetRegistrationsByEventId.mockResolvedValueOnce(allRegistrations)
    mockFixRegistrationGroups.mockResolvedValueOnce(filteredRegistrations)

    const result = await getAdminRegistrationsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetRegistrationsByEventId).toHaveBeenCalledWith(eventId)
    expect(mockFixRegistrationGroups).toHaveBeenCalledWith(filteredRegistrations, user)
    expect(result.statusCode).toBe(200)
  })

  it('passes through errors from query', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const error = new Error('Database error')

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetRegistrationsByEventId.mockRejectedValueOnce(error)

    await expect(getAdminRegistrationsLambda(event)).rejects.toThrow(error)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetRegistrationsByEventId).toHaveBeenCalledWith(eventId)
    expect(mockFixRegistrationGroups).not.toHaveBeenCalled()
  })

  it('passes through errors from fixRegistrationGroups', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const allRegistrations = [{ class: 'ALO', eventId, id: 'reg1', state: 'ready' }]
    const filteredRegistrations = [{ class: 'ALO', eventId, id: 'reg1', state: 'ready' }]
    const error = new Error('Group fixing error')

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetRegistrationsByEventId.mockResolvedValueOnce(allRegistrations)
    mockFixRegistrationGroups.mockRejectedValueOnce(error)

    await expect(getAdminRegistrationsLambda(event)).rejects.toThrow(error)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetRegistrationsByEventId).toHaveBeenCalledWith(eventId)
    expect(mockFixRegistrationGroups).toHaveBeenCalledWith(filteredRegistrations, user)
  })
})
