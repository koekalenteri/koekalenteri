import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockGetOrigin = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockSendTemplatedEmailToEventRegistrations = jest.fn<any>()
const mockSetReserveNotified = jest.fn<any>()
const mockMarkParticipants = jest.fn<any>()
const mockQuery = jest.fn<any>()
const mockRead = jest.fn<any>()

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

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../lib/registration', () => ({
  sendTemplatedEmailToEventRegistrations: mockSendTemplatedEmailToEventRegistrations,
  setReserveNotified: mockSetReserveNotified,
}))

jest.unstable_mockModule('../lib/event', () => ({
  markParticipants: mockMarkParticipants,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    query: mockQuery,
    read: mockRead,
  })),
}))

const { default: sendMessagesLambda } = await import('./handler')

describe('sendMessagesLambda', () => {
  const event = {
    body: JSON.stringify({
      template: 'invitation',
      eventId: 'event123',
      contactInfo: { email: 'contact@example.com' },
      registrationIds: ['reg456', 'reg789'],
      text: 'Test message',
    }),
    headers: {},
  } as any

  const mockRegistrations = [
    {
      id: 'reg456',
      eventId: 'event123',
      state: 'ready',
      class: 'ALO',
    },
    {
      id: 'reg789',
      eventId: 'event123',
      state: 'ready',
      class: 'ALO',
    },
  ]

  const mockEvent = {
    id: 'event123',
    state: 'draft',
    classes: [
      { class: 'ALO', state: 'draft' },
      { class: 'AVO', state: 'draft' },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Test User',
    })

    mockGetOrigin.mockReturnValue('https://example.com')

    mockParseJSONWithFallback.mockReturnValue({
      template: 'invitation',
      eventId: 'event123',
      contactInfo: { email: 'contact@example.com' },
      registrationIds: ['reg456', 'reg789'],
      text: 'Test message',
    })

    mockQuery.mockResolvedValue(mockRegistrations)
    mockRead.mockResolvedValue(mockEvent)

    mockSendTemplatedEmailToEventRegistrations.mockResolvedValue({
      ok: ['recipient@example.com'],
      failed: [],
    })

    mockMarkParticipants.mockImplementation((event: any) => event)
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await sendMessagesLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('returns 400 if not all registrations were found', async () => {
    // Only return one registration when two were requested
    mockQuery.mockResolvedValueOnce([mockRegistrations[0]])

    await sendMessagesLambda(event)

    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': 'event123' },
    })
    expect(mockResponse).toHaveBeenCalledWith(400, 'Not all registrations were found, aborting!', event)
    expect(mockSendTemplatedEmailToEventRegistrations).not.toHaveBeenCalled()
  })

  it('returns 404 if event not found', async () => {
    mockRead.mockResolvedValueOnce(null)

    await sendMessagesLambda(event)

    expect(mockRead).toHaveBeenCalledWith({ id: 'event123' }, expect.any(String))
    expect(mockResponse).toHaveBeenCalledWith(404, 'Event not found', event)
    expect(mockSendTemplatedEmailToEventRegistrations).not.toHaveBeenCalled()
  })

  it('sends invitation emails and marks participants as invited', async () => {
    await sendMessagesLambda(event)

    // Verify emails were sent
    expect(mockSendTemplatedEmailToEventRegistrations).toHaveBeenCalledWith(
      'invitation',
      { ...mockEvent, contactInfo: { email: 'contact@example.com' } },
      mockRegistrations,
      'https://example.com',
      'Test message',
      'Test User',
      ''
    )

    // Verify participants were marked
    expect(mockMarkParticipants).toHaveBeenCalledWith(mockEvent, 'invited', 'ALO')

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        ok: ['recipient@example.com'],
        failed: [],
        classes: mockEvent.classes,
        state: mockEvent.state,
        registrations: mockRegistrations,
      },
      event
    )
  })

  it('sends picked emails and marks participants as picked', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      template: 'picked',
      eventId: 'event123',
      contactInfo: { email: 'contact@example.com' },
      registrationIds: ['reg456', 'reg789'],
      text: 'Test message',
    })

    await sendMessagesLambda(event)

    // Verify emails were sent
    expect(mockSendTemplatedEmailToEventRegistrations).toHaveBeenCalledWith(
      'picked',
      expect.any(Object),
      expect.any(Array),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String)
    )

    // Verify participants were marked
    expect(mockMarkParticipants).toHaveBeenCalledWith(mockEvent, 'picked', 'ALO')
  })

  it('sends reserve emails and marks registrations as notified', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      template: 'reserve',
      eventId: 'event123',
      contactInfo: { email: 'contact@example.com' },
      registrationIds: ['reg456', 'reg789'],
      text: 'Test message',
    })

    await sendMessagesLambda(event)

    // Verify emails were sent
    expect(mockSendTemplatedEmailToEventRegistrations).toHaveBeenCalledWith(
      'reserve',
      expect.any(Object),
      expect.any(Array),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String)
    )

    // Verify registrations were marked as notified
    expect(mockSetReserveNotified).toHaveBeenCalledWith(mockRegistrations)

    // Verify participants were not marked
    expect(mockMarkParticipants).not.toHaveBeenCalled()
  })

  it('sends other template emails without marking participants', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      template: 'registration',
      eventId: 'event123',
      contactInfo: { email: 'contact@example.com' },
      registrationIds: ['reg456', 'reg789'],
      text: 'Test message',
    })

    await sendMessagesLambda(event)

    // Verify emails were sent
    expect(mockSendTemplatedEmailToEventRegistrations).toHaveBeenCalledWith(
      'registration',
      expect.any(Object),
      expect.any(Array),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String)
    )

    // Verify registrations were not marked as notified
    expect(mockSetReserveNotified).not.toHaveBeenCalled()

    // Verify participants were not marked
    expect(mockMarkParticipants).not.toHaveBeenCalled()
  })

  it('handles failed email sending', async () => {
    mockSendTemplatedEmailToEventRegistrations.mockResolvedValueOnce({
      ok: [],
      failed: ['recipient@example.com'],
    })

    await sendMessagesLambda(event)

    // Verify response includes failed recipients
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        ok: [],
        failed: ['recipient@example.com'],
        classes: mockEvent.classes,
        state: mockEvent.state,
        registrations: mockRegistrations,
      },
      event
    )
  })

  it('does not mark participants when only one registration ID is provided with invitation template', async () => {
    // Modify the parsed JSON to have only one registration ID
    mockParseJSONWithFallback.mockReturnValueOnce({
      template: 'invitation',
      eventId: 'event123',
      contactInfo: { email: 'contact@example.com' },
      registrationIds: ['reg456'], // Only one registration ID
      text: 'Test message',
    })

    // Modify the query result to return only one registration
    const singleRegistration = [
      {
        id: 'reg456',
        eventId: 'event123',
        state: 'ready',
        class: 'ALO',
      },
    ]
    mockQuery.mockResolvedValueOnce(singleRegistration)

    await sendMessagesLambda(event)

    // Verify emails were sent
    expect(mockSendTemplatedEmailToEventRegistrations).toHaveBeenCalledWith(
      'invitation',
      expect.any(Object),
      singleRegistration, // Only one registration
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String)
    )

    // Verify participants were NOT marked (since registrationIds.length is not > 1)
    expect(mockMarkParticipants).not.toHaveBeenCalled()
  })

  it('does not mark participants when only one registration ID is provided with picked template', async () => {
    // Modify the parsed JSON to have only one registration ID
    mockParseJSONWithFallback.mockReturnValueOnce({
      template: 'picked',
      eventId: 'event123',
      contactInfo: { email: 'contact@example.com' },
      registrationIds: ['reg456'], // Only one registration ID
      text: 'Test message',
    })

    // Modify the query result to return only one registration
    const singleRegistration = [
      {
        id: 'reg456',
        eventId: 'event123',
        state: 'ready',
        class: 'ALO',
      },
    ]
    mockQuery.mockResolvedValueOnce(singleRegistration)

    await sendMessagesLambda(event)

    // Verify emails were sent
    expect(mockSendTemplatedEmailToEventRegistrations).toHaveBeenCalledWith(
      'picked',
      expect.any(Object),
      singleRegistration, // Only one registration
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String)
    )

    // Verify participants were NOT marked (since registrationIds.length is not > 1)
    expect(mockMarkParticipants).not.toHaveBeenCalled()
  })

  it('filters out registrations that are not in ready state', async () => {
    // Include a registration that is not in 'ready' state
    const mixedRegistrations = [
      {
        id: 'reg456',
        eventId: 'event123',
        state: 'ready',
        class: 'ALO',
      },
      {
        id: 'reg789',
        eventId: 'event123',
        state: 'ready',
        class: 'ALO',
      },
      {
        id: 'reg999',
        eventId: 'event123',
        state: 'cancelled', // Not in 'ready' state
        class: 'ALO',
      },
    ]

    // Add reg999 to the requested IDs
    mockParseJSONWithFallback.mockReturnValueOnce({
      template: 'invitation',
      eventId: 'event123',
      contactInfo: { email: 'contact@example.com' },
      registrationIds: ['reg456', 'reg789', 'reg999'],
      text: 'Test message',
    })

    // Return all registrations including the non-ready one
    mockQuery.mockResolvedValueOnce(mixedRegistrations)

    await sendMessagesLambda(event)

    // Verify only ready registrations were used for the email
    const readyRegistrations = mixedRegistrations.filter((r) => r.state === 'ready')

    // Should fail because not all requested registrations were found in ready state
    expect(mockResponse).toHaveBeenCalledWith(400, 'Not all registrations were found, aborting!', event)
    expect(mockSendTemplatedEmailToEventRegistrations).not.toHaveBeenCalled()
  })

  it('uses the correct event table when reading the event', async () => {
    await sendMessagesLambda(event)

    // Verify the read operation used the correct table
    expect(mockRead).toHaveBeenCalledWith(
      { id: 'event123' },
      expect.stringContaining('event') // The table name should contain 'event'
    )
  })

  it('handles registrations with different classes correctly', async () => {
    // Create registrations with different classes
    const multiClassRegistrations = [
      {
        id: 'reg456',
        eventId: 'event123',
        state: 'ready',
        class: 'ALO',
      },
      {
        id: 'reg789',
        eventId: 'event123',
        state: 'ready',
        class: 'AVO', // Different class
      },
    ]

    mockQuery.mockResolvedValueOnce(multiClassRegistrations)

    const testEvent = {
      id: 'event123',
      state: 'draft',
      classes: [
        { class: 'ALO', state: 'draft' },
        { class: 'AVO', state: 'draft' },
      ],
    }
    mockRead.mockResolvedValueOnce(testEvent)

    await sendMessagesLambda(event)

    // Verify emails were sent
    expect(mockSendTemplatedEmailToEventRegistrations).toHaveBeenCalledWith(
      'invitation',
      expect.any(Object),
      multiClassRegistrations,
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String)
    )

    // Verify participants were marked with the class of the first registration
    expect(mockMarkParticipants).toHaveBeenCalledWith(testEvent, 'invited', 'ALO')
  })
})
