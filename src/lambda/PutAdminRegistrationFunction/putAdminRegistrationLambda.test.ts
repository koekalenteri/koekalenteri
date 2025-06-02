import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockGetOrigin = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockEmailTo = jest.fn<any>()
const mockRegistrationEmailTemplateData = jest.fn<any>()
const mockSendTemplatedMail = jest.fn<any>()
const mockUpdateRegistrations = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockGetRegistration = jest.fn<any>()
const mockGetRegistrationChanges = jest.fn<any>()
const mockSaveRegistration = jest.fn<any>()
const mockUpdateEventStatsForRegistration = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/api-gw', () => ({
  getOrigin: mockGetOrigin,
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

jest.unstable_mockModule('../lib/email', () => ({
  emailTo: mockEmailTo,
  registrationEmailTemplateData: mockRegistrationEmailTemplateData,
  sendTemplatedMail: mockSendTemplatedMail,
}))

jest.unstable_mockModule('../lib/event', () => ({
  updateRegistrations: mockUpdateRegistrations,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../lib/registration', () => ({
  getRegistration: mockGetRegistration,
  getRegistrationChanges: mockGetRegistrationChanges,
  saveRegistration: mockSaveRegistration,
}))

jest.unstable_mockModule('../lib/stats', () => ({
  updateEventStatsForRegistration: mockUpdateEventStatsForRegistration,
}))

const { default: putAdminRegistrationLambda } = await import('./handler')

describe('putAdminRegistrationLambda', () => {
  const event = {
    body: JSON.stringify({
      eventId: 'event123',
      id: 'reg456',
      handler: {
        email: 'handler@example.com',
      },
      owner: {
        email: 'owner@example.com',
      },
      language: 'fi',
      class: 'ALO',
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

    mockGetOrigin.mockReturnValue('https://example.com')

    mockParseJSONWithFallback.mockReturnValue({
      eventId: 'event123',
      id: 'reg456',
      handler: {
        email: 'handler@example.com',
      },
      owner: {
        email: 'owner@example.com',
      },
      language: 'fi',
      class: 'ALO',
    })

    mockGetRegistration.mockResolvedValue({
      eventId: 'event123',
      id: 'reg456',
      state: 'draft',
    })

    mockUpdateRegistrations.mockResolvedValue({
      id: 'event123',
      name: 'Test Event',
      classes: [{ class: 'ALO', entries: 10 }],
    })

    mockRegistrationAuditKey.mockReturnValue('event123:reg456')

    mockGetRegistrationChanges.mockReturnValue('Muokkasi ilmoittautumista')

    mockSaveRegistration.mockResolvedValue({})

    mockUpdateEventStatsForRegistration.mockResolvedValue({})

    mockEmailTo.mockReturnValue(['handler@example.com', 'owner@example.com'])

    mockRegistrationEmailTemplateData.mockReturnValue({
      eventName: 'Test Event',
      registrationId: 'reg456',
    })

    mockSendTemplatedMail.mockResolvedValue(undefined)
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await putAdminRegistrationLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockSaveRegistration).not.toHaveBeenCalled()
  })

  it('creates a new registration when id is not provided', async () => {
    const newEvent = {
      ...event,
      body: JSON.stringify({
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        owner: {
          email: 'owner@example.com',
        },
        language: 'fi',
        class: 'ALO',
      }),
    }

    mockParseJSONWithFallback.mockReturnValueOnce({
      eventId: 'event123',
      handler: {
        email: 'handler@example.com',
      },
      owner: {
        email: 'owner@example.com',
      },
      language: 'fi',
      class: 'ALO',
    })

    await putAdminRegistrationLambda(newEvent)

    // Verify registration was saved with new ID and state 'ready'
    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event123',
        id: expect.any(String), // nanoid generated
        createdAt: expect.any(String),
        createdBy: 'Test User',
        modifiedAt: expect.any(String),
        modifiedBy: 'Test User',
        state: 'ready',
      })
    )

    // Verify audit message for new registration
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: expect.any(String),
      message: 'Lisäsi ilmoittautumisen',
      user: 'Test User',
    })

    // Verify email was sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'registration',
      'fi',
      expect.any(String), // emailFrom
      expect.any(Array), // to
      expect.any(Object) // templateData
    )

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        eventId: 'event123',
        state: 'ready',
      }),
      newEvent
    )
  })

  it('updates an existing registration', async () => {
    await putAdminRegistrationLambda(event)

    // Verify existing registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    // Verify registration was saved with updated data
    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event123',
        id: 'reg456',
        modifiedAt: expect.any(String),
        modifiedBy: 'Test User',
        state: 'draft', // Preserved from existing
        handler: {
          email: 'handler@example.com',
        },
        owner: {
          email: 'owner@example.com',
        },
        language: 'fi',
        class: 'ALO',
      })
    )

    // Verify event registrations were updated
    expect(mockUpdateRegistrations).toHaveBeenCalledWith('event123')

    // Verify event stats were updated
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledWith(
      expect.any(Object), // data
      expect.any(Object), // existing
      expect.any(Object) // confirmedEvent
    )

    // Verify audit message for updated registration
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message: 'Muokkasi ilmoittautumista',
      user: 'Test User',
    })

    // Verify email was sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'registration',
      'fi',
      expect.any(String), // emailFrom
      expect.any(Array), // to
      expect.any(Object) // templateData
    )

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(Object), event)
  })

  it('does not send email if handler or owner email is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      eventId: 'event123',
      id: 'reg456',
      handler: {}, // No email
      owner: {
        email: 'owner@example.com',
      },
      language: 'fi',
      class: 'ALO',
    })

    await putAdminRegistrationLambda(event)

    // Verify email was not sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify registration was still saved
    expect(mockSaveRegistration).toHaveBeenCalled()

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(Object), event)
  })

  it('does not create audit entry if no changes were made', async () => {
    mockGetRegistrationChanges.mockReturnValueOnce('')

    await putAdminRegistrationLambda(event)

    // Verify audit was not called
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify registration was still saved
    expect(mockSaveRegistration).toHaveBeenCalled()

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(Object), event)
  })
})
