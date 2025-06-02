import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockUpdateRegistrationField = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../lib/registration', () => ({
  updateRegistrationField: mockUpdateRegistrationField,
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

    mockUpdateRegistrationField.mockResolvedValue({})
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await putAdminRegistrationNotesLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
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

    // Verify audit entry was created
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      user: 'Test User',
      message: 'Muutti sisäistä kommenttia',
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

    // Verify audit entry was not created
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('passes through errors from updateRegistrationField', async () => {
    const error = new Error('Database error')
    mockUpdateRegistrationField.mockRejectedValueOnce(error)

    await expect(putAdminRegistrationNotesLambda(event)).rejects.toThrow(error)

    // Verify registration field update was attempted
    expect(mockUpdateRegistrationField).toHaveBeenCalled()

    // Verify audit entry was not created
    expect(mockAudit).not.toHaveBeenCalled()
  })
})
