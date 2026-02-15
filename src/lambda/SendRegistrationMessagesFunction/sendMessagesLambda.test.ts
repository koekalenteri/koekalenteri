import type { Registration } from '../../types'
import { jest } from '@jest/globals'

const mockLambda = jest.fn((_name, fn) => fn)
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

import * as eventLib from '../lib/event'
import * as regLib from '../lib/registration'

jest.unstable_mockModule('../lib/registration', () => ({
  ...regLib,
  sendTemplatedEmailToEventRegistrations: mockSendTemplatedEmailToEventRegistrations,
  setReserveNotified: mockSetReserveNotified,
}))

jest.unstable_mockModule('../lib/event', () => ({
  ...eventLib,
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
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789'],
      template: 'invitation',
      text: 'Test message',
    }),
    headers: {},
  } as any

  const mockRegistrations: Partial<Registration>[] = [
    {
      class: 'ALO',
      eventId: 'event123',
      id: 'reg456',
      state: 'ready',
    },
    {
      class: 'ALO',
      eventId: 'event123',
      id: 'reg789',
      state: 'ready',
    },
  ]

  const mockEvent = {
    classes: [
      { class: 'ALO', state: 'draft' },
      { class: 'AVO', state: 'draft' },
    ],
    id: 'event123',
    state: 'draft',
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
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789'],
      template: 'invitation',
      text: 'Test message',
    })

    mockQuery.mockResolvedValue(mockRegistrations)
    mockRead.mockResolvedValue(mockEvent)

    // Set up the messagesSent property for the mock registrations
    mockRegistrations.forEach((reg) => {
      reg.messagesSent = { invitation: true, picked: true }
      // Add group property for participant status
      reg.group = { key: 'group1', number: 1 }
    })

    mockSendTemplatedEmailToEventRegistrations.mockResolvedValue({
      failed: [],
      ok: ['recipient@example.com'],
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
        classes: mockEvent.classes,
        failed: [],
        ok: ['recipient@example.com'],
        registrations: mockRegistrations,
        state: mockEvent.state,
      },
      event
    )
  })

  it('sends picked emails and marks participants as picked', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789'],
      template: 'picked',
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
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789'],
      template: 'reserve',
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
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789'],
      template: 'registration',
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
      failed: ['recipient@example.com'],
      ok: [],
    })

    await sendMessagesLambda(event)

    // Verify response includes failed recipients
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        classes: mockEvent.classes,
        failed: ['recipient@example.com'],
        ok: [],
        registrations: mockRegistrations,
        state: mockEvent.state,
      },
      event
    )
  })

  it('does not mark participants when only one registration ID is provided with invitation template', async () => {
    // Modify the parsed JSON to have only one registration ID
    mockParseJSONWithFallback.mockReturnValueOnce({
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456'], // Only one registration ID
      template: 'invitation',
      text: 'Test message',
    })

    // Modify the query result to return only one registration
    const singleRegistration = [
      {
        class: 'ALO',
        eventId: 'event123',
        id: 'reg456',
        state: 'ready',
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
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456'], // Only one registration ID
      template: 'picked',
      text: 'Test message',
    })

    // Modify the query result to return only one registration
    const singleRegistration = [
      {
        class: 'ALO',
        eventId: 'event123',
        id: 'reg456',
        state: 'ready',
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
        class: 'ALO',
        eventId: 'event123',
        id: 'reg456',
        state: 'ready',
      },
      {
        class: 'ALO',
        eventId: 'event123',
        id: 'reg789',
        state: 'ready',
      },
      {
        class: 'ALO',
        eventId: 'event123',
        id: 'reg999',
        state: 'cancelled', // Not in 'ready' state
      },
    ]

    // Add reg999 to the requested IDs
    mockParseJSONWithFallback.mockReturnValueOnce({
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789', 'reg999'],
      template: 'invitation',
      text: 'Test message',
    })

    // Return all registrations including the non-ready one
    mockQuery.mockResolvedValueOnce(mixedRegistrations)

    await sendMessagesLambda(event)

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
        class: 'ALO',
        eventId: 'event123',
        group: { key: 'group1', number: 1 },
        id: 'reg456',
        messagesSent: { invitation: true },
        state: 'ready',
      },
      {
        class: 'AVO', // Different class
        eventId: 'event123',
        group: { key: 'group2', number: 1 },
        id: 'reg789',
        messagesSent: { invitation: true },
        state: 'ready',
      },
    ]

    mockQuery.mockResolvedValueOnce(multiClassRegistrations)

    const testEvent = {
      classes: [
        { class: 'ALO', state: 'draft' },
        { class: 'AVO', state: 'draft' },
      ],
      id: 'event123',
      state: 'draft',
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

  it('only marks participants when all registrations for a class have received the message', async () => {
    // Create registrations with the same class
    const sameClassRegistrations: Partial<Registration>[] = [
      {
        class: 'ALO',
        eventId: 'event123',
        group: { key: 'group1', number: 1 },
        id: 'reg456',
        messagesSent: { invitation: true }, // This one has received the message
        state: 'ready',
      },
      {
        class: 'ALO',
        eventId: 'event123',
        group: { key: 'group1', number: 2 },
        id: 'reg789',
        messagesSent: { invitation: false }, // This one has not received the message
        state: 'ready',
      },
      {
        class: 'AVO',
        eventId: 'event123',
        group: { key: 'group2', number: 1 },
        id: 'reg101',
        messagesSent: { invitation: true }, // This one has received the message
        state: 'ready',
      },
    ]

    mockQuery.mockResolvedValueOnce(sameClassRegistrations)
    mockParseJSONWithFallback.mockReturnValueOnce({
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456'], // Only sending to one registration
      template: 'invitation',
      text: 'Test message',
    })

    await sendMessagesLambda(event)

    // Verify markParticipants was not called for ALO class since not all ALO registrations have received the message
    expect(mockMarkParticipants).not.toHaveBeenCalledWith(expect.anything(), 'invited', 'ALO')

    // But it should have been called for AVO class since all AVO registrations have received the message
    expect(mockMarkParticipants).toHaveBeenCalledWith(expect.anything(), 'invited', 'AVO')
  })

  it('marks participants when all registrations for a class have received the message', async () => {
    // Create registrations where all have received the message
    const allReceivedRegistrations: Partial<Registration>[] = [
      {
        class: 'ALO',
        eventId: 'event123',
        group: { key: 'group1', number: 1 },
        id: 'reg456',
        messagesSent: { invitation: true }, // This one has received the message
        state: 'ready',
      },
      {
        class: 'ALO',
        eventId: 'event123',
        group: { key: 'group1', number: 2 },
        id: 'reg789',
        messagesSent: { invitation: true }, // This one has also received the message
        state: 'ready',
      },
      {
        class: 'AVO',
        eventId: 'event123',
        group: { key: 'group2', number: 1 },
        id: 'reg101',
        messagesSent: { invitation: true }, // This one has received the message
        state: 'ready',
      },
    ]

    mockQuery.mockResolvedValueOnce(allReceivedRegistrations)
    mockParseJSONWithFallback.mockReturnValueOnce({
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456'], // Only sending to one registration
      template: 'invitation',
      text: 'Test message',
    })

    await sendMessagesLambda(event)

    // Verify markParticipants was called for both classes since all registrations have received the message
    expect(mockMarkParticipants).toHaveBeenCalledWith(expect.anything(), 'invited', 'ALO')
    expect(mockMarkParticipants).toHaveBeenCalledWith(expect.anything(), 'invited', 'AVO')
  })

  it('only marks participants when all registrations in participant groups have received the message', async () => {
    // Create registrations with different groups
    const mixedGroupRegistrations: Partial<Registration>[] = [
      {
        class: 'ALO',
        eventId: 'event123',
        group: { key: 'group1', number: 1 },
        id: 'reg456',
        messagesSent: { invitation: true }, // This one has received the message
        state: 'ready',
      },
      {
        class: 'ALO',
        eventId: 'event123',
        group: { key: 'group2', number: 2 },
        id: 'reg789',
        messagesSent: { invitation: false }, // This one has not received the message
        state: 'ready',
      },
      {
        class: 'ALO',
        eventId: 'event123',
        group: { key: 'reserve', number: 3 }, // This one is on reserve
        id: 'reg101',
        messagesSent: { invitation: false }, // This one has not received the message
        state: 'ready',
      },
      {
        class: 'AVO',
        eventId: 'event123',
        group: { key: 'group3', number: 1 },
        id: 'reg102',
        messagesSent: { invitation: true }, // This one has received the message
        state: 'ready',
      },
    ]

    mockQuery.mockResolvedValueOnce(mixedGroupRegistrations)
    mockParseJSONWithFallback.mockReturnValueOnce({
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456'], // Only sending to one registration
      template: 'invitation',
      text: 'Test message',
    })

    await sendMessagesLambda(event)

    // Verify markParticipants was not called for ALO class since not all participant groups have received the message
    expect(mockMarkParticipants).not.toHaveBeenCalledWith(expect.anything(), 'invited', 'ALO')

    // But it should have been called for AVO class since all participant groups have received the message
    expect(mockMarkParticipants).toHaveBeenCalledWith(expect.anything(), 'invited', 'AVO')
  })

  it('handles registrations with no class by using eventType', async () => {
    // Create registrations with no class
    const noClassRegistrations: Partial<Registration>[] = [
      {
        eventId: 'event123',
        eventType: 'NOME',
        group: { key: 'group1', number: 1 },
        id: 'reg456',
        messagesSent: { invitation: true }, // This one has received the message
        state: 'ready',
      },
      {
        eventId: 'event123',
        eventType: 'NOME',
        group: { key: 'group2', number: 2 },
        id: 'reg789',
        messagesSent: { invitation: true }, // This one has received the message
        state: 'ready',
      },
    ]

    mockQuery.mockResolvedValueOnce(noClassRegistrations)
    mockParseJSONWithFallback.mockReturnValueOnce({
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456'], // Only sending to one registration
      template: 'invitation',
      text: 'Test message',
    })

    await sendMessagesLambda(event)

    // Verify markParticipants was called with undefined since NOME is not a valid registration class
    expect(mockMarkParticipants).toHaveBeenCalledWith(expect.anything(), 'invited', undefined)
  })

  it('uses the correct state when marking participants based on template', async () => {
    // Test with invitation template
    mockParseJSONWithFallback.mockReturnValueOnce({
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789'],
      template: 'invitation',
      text: 'Test message',
    })

    await sendMessagesLambda(event)
    expect(mockMarkParticipants).toHaveBeenCalledWith(expect.anything(), 'invited', expect.anything())

    // Reset mocks
    jest.clearAllMocks()

    // Test with picked template
    mockParseJSONWithFallback.mockReturnValueOnce({
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789'],
      template: 'picked',
      text: 'Test message',
    })
    mockQuery.mockResolvedValueOnce(mockRegistrations)
    mockRead.mockResolvedValueOnce(mockEvent)
    mockSendTemplatedEmailToEventRegistrations.mockResolvedValueOnce({
      failed: [],
      ok: ['recipient@example.com'],
    })

    await sendMessagesLambda(event)
    expect(mockMarkParticipants).toHaveBeenCalledWith(expect.anything(), 'picked', expect.anything())
  })
})
