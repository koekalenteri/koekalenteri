import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockUpdateRegistrationNotes = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../registration/actions', () => ({
  updateRegistrationNotes: mockUpdateRegistrationNotes,
}))

const { putAdminRegistrationNotesLambda } = await import('./handler')

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
    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Test User',
    })

    mockParseJSONWithFallback.mockReturnValue({
      eventId: 'event123',
      id: 'reg456',
      internalNotes: 'Test internal notes',
    })

    mockRegistrationAuditKey.mockReturnValue('event123:reg456')

    mockUpdateRegistrationNotes.mockResolvedValue({
      registration: { eventId: 'event123', id: 'reg456', internalNotes: 'Test internal notes' },
    })
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const result = await putAdminRegistrationNotesLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
    expect(mockUpdateRegistrationNotes).not.toHaveBeenCalled()
  })

  it('updates registration internal notes successfully and calls audit', async () => {
    const result = await putAdminRegistrationNotesLambda(event)

    // Verify updateRegistrationNotes was called with correct command
    expect(mockUpdateRegistrationNotes).toHaveBeenCalledWith({
      eventId: 'event123',
      internalNotes: 'Test internal notes',
      registrationId: 'reg456',
    })

    // Verify audit entry was created
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message: 'Muutti sisäistä kommenttia',
      user: 'Test User',
    })

    // Verify response
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toBe('ok')
  })

  it('throws error if eventId is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      id: 'reg456',
      internalNotes: 'Test internal notes',
    })

    await expect(putAdminRegistrationNotesLambda(event)).rejects.toThrow('Event id or registration id missing')

    // Verify updateRegistrationNotes was not called
    expect(mockUpdateRegistrationNotes).not.toHaveBeenCalled()

    // Verify audit entry was not created
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('throws error if registration id is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      eventId: 'event123',
      internalNotes: 'Test internal notes',
    })

    await expect(putAdminRegistrationNotesLambda(event)).rejects.toThrow('Event id or registration id missing')

    // Verify updateRegistrationNotes was not called
    expect(mockUpdateRegistrationNotes).not.toHaveBeenCalled()

    // Verify audit entry was not created
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('passes through errors from updateRegistrationNotes', async () => {
    const error = new Error('Registration not found')
    mockUpdateRegistrationNotes.mockRejectedValueOnce(error)

    await expect(putAdminRegistrationNotesLambda(event)).rejects.toThrow(error)

    // Verify updateRegistrationNotes was attempted
    expect(mockUpdateRegistrationNotes).toHaveBeenCalled()

    // Verify audit entry was not created since action failed
    expect(mockAudit).not.toHaveBeenCalled()
  })
})
