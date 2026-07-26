import { jest } from '@jest/globals'

const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorizeWithMemberOf = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockUpdateRegistrationField = jest.fn<any>()
const mockPublishRegistrationPatches = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
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

jest.unstable_mockModule('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../lib/registration', () => ({
  updateRegistrationField: mockUpdateRegistrationField,
}))

jest.unstable_mockModule('../lib/ws/actions', () => ({
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

const { default: putAdminRegistrationNotesLambda } = await import('./handler')

describe('putAdminRegistrationNotesLambda', () => {
  const event = {
    body: JSON.stringify({
      eventId: 'event123',
      id: 'reg456',
      internalNotes: 'Test internal notes',
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorizeWithMemberOf.mockResolvedValue({
      memberOf: ['org-1'],
      user: { admin: false, id: 'user123', name: 'Test User' },
    })

    mockParseJSONWithFallback.mockReturnValue({
      eventId: 'event123',
      id: 'reg456',
      internalNotes: 'Test internal notes',
    })

    mockRegistrationAuditKey.mockReturnValue('event123:reg456')

    mockGetEvent.mockResolvedValue({ organizer: { id: 'org-1' } })
    mockUpdateRegistrationField.mockResolvedValue({})
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      res: { body: 'Unauthorized', statusCode: 401 },
    })

    await putAdminRegistrationNotesLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).not.toHaveBeenCalled()
    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
  })

  it('rejects users outside the event organizer before updating notes', async () => {
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-2' } })

    await expect(putAdminRegistrationNotesLambda(event)).rejects.toMatchObject({
      message: 'Forbidden',
      statusCode: 403,
    })

    expect(mockGetEvent).toHaveBeenCalledWith('event123')
    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('allows admins to update notes for any organizer', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      memberOf: [],
      user: { admin: true, id: 'admin1', name: 'Admin User' },
    })
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-2' } })

    await putAdminRegistrationNotesLambda(event)

    expect(mockUpdateRegistrationField).toHaveBeenCalled()
  })

  it('updates registration internal notes successfully', async () => {
    await putAdminRegistrationNotesLambda(event)

    // Verify registration field was updated
    expect(mockUpdateRegistrationField).toHaveBeenCalledWith(
      'event123',
      'reg456',
      'internalNotes',
      'Test internal notes'
    )

    expect(mockGetEvent).toHaveBeenCalledWith('event123')
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event123',
      [{ id: 'reg456', internalNotes: 'Test internal notes' }],
      'org-1'
    )

    // Verify audit entry was created
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message: 'Muutti sisäistä kommenttia',
      user: 'Test User',
    })

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(200, 'ok', event)
  })

  it('throws error if eventId is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      id: 'reg456',
      internalNotes: 'Test internal notes',
    })

    await expect(putAdminRegistrationNotesLambda(event)).rejects.toThrow('Event id or registration id missing')

    // Verify registration field was not updated
    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()

    // Verify audit entry was not created
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('throws error if registration id is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      eventId: 'event123',
      internalNotes: 'Test internal notes',
    })

    await expect(putAdminRegistrationNotesLambda(event)).rejects.toThrow('Event id or registration id missing')

    // Verify registration field was not updated
    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()

    // Verify audit entry was not created
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('passes through errors from updateRegistrationField', async () => {
    const error = new Error('Database error')
    mockUpdateRegistrationField.mockRejectedValueOnce(error)

    await expect(putAdminRegistrationNotesLambda(event)).rejects.toThrow(error)

    // Verify registration field update was attempted
    expect(mockUpdateRegistrationField).toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()

    // Verify audit entry was not created
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('passes through errors from publishRegistrationPatches', async () => {
    const error = new Error('Broadcast error')
    mockPublishRegistrationPatches.mockRejectedValueOnce(error)

    await expect(putAdminRegistrationNotesLambda(event)).rejects.toThrow(error)

    expect(mockUpdateRegistrationField).toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })
})
