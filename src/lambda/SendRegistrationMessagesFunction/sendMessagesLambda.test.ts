import type { JsonConfirmedEvent, Registration } from '../../types'
import { vi } from 'vitest'

const setEventBody = (event: { body: string }, body: unknown) => {
  event.body = JSON.stringify(body)
}

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockAuthorizeWithMemberOf = vi.fn()
const mockGetOrigin = vi.fn()
const mockSendTemplatedEmailToEventRegistrations = vi.fn()
const mockSetReserveNotified = vi.fn()
const mockGetReadyRegistrationsByEventId = vi.fn()
const mockMarkParticipants = vi.fn()
const mockQuery = vi.fn()
const mockRead = vi.fn()
const mockUpdate = vi.fn()
const mockAudit = vi.fn()
const mockEventAuditKey = vi.fn()
const mockPublishEventPatch = vi.fn()
const mockPublishRegistrationPatches = vi.fn()

vi.doMock('../lib/lambda', () => ({
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

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

vi.doMock('../lib/api-gw', () => ({
  getOrigin: mockGetOrigin,
}))

vi.doMock('../lib/audit', () => ({
  audit: mockAudit,
  eventAuditKey: mockEventAuditKey,
}))

vi.doMock('../lib/ws/actions', () => ({
  publishEventPatch: mockPublishEventPatch,
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

import * as eventLib from '../lib/event'
import * as regLib from '../lib/registration'

vi.doMock('../lib/registration', () => ({
  ...regLib,
  getReadyRegistrationsByEventId: mockGetReadyRegistrationsByEventId,
  sendTemplatedEmailToEventRegistrations: mockSendTemplatedEmailToEventRegistrations,
  setReserveNotified: mockSetReserveNotified,
}))

vi.doMock('../lib/event', () => ({
  ...eventLib,
  markParticipants: mockMarkParticipants,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(() => ({
    query: mockQuery,
    read: mockRead,
    update: mockUpdate,
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
    organizer: { id: 'org-1' },
    state: 'draft',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    delete (mockEvent as Partial<JsonConfirmedEvent>).startListPublished

    // Default mock implementations
    mockAuthorizeWithMemberOf.mockResolvedValue({
      memberOf: ['org-1'],
      user: { id: 'user123', name: 'Test User' },
    })

    mockGetOrigin.mockReturnValue('https://example.com')

    setEventBody(event, {
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789'],
      template: 'invitation',
      text: 'Test message',
    })

    mockGetReadyRegistrationsByEventId.mockResolvedValue(mockRegistrations)
    mockRead.mockResolvedValue({ ...mockEvent })

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

    mockMarkParticipants.mockImplementation((event: JsonConfirmedEvent, state: string) =>
      state === 'invited' ? { ...event, startListPublished: event.startListPublished ?? false } : event
    )
    mockEventAuditKey.mockImplementation((event: { id: string }) => `event:${event.id}`)
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res: { body: 'Unauthorized', statusCode: 401 } })

    await sendMessagesLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('rejects users outside the event organizer before reading registrations or sending messages', async () => {
    mockRead.mockResolvedValueOnce({ ...mockEvent, organizer: { id: 'org-2' } })

    await expect(sendMessagesLambda(event)).rejects.toMatchObject({ message: 'Forbidden', statusCode: 403 })

    expect(mockGetReadyRegistrationsByEventId).not.toHaveBeenCalled()
    expect(mockSendTemplatedEmailToEventRegistrations).not.toHaveBeenCalled()
  })

  it('returns 400 if not all registrations were found', async () => {
    // Only return one registration when two were requested
    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce([mockRegistrations[0]])

    await sendMessagesLambda(event)

    expect(mockGetReadyRegistrationsByEventId).toHaveBeenCalledWith('event123')
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
    expect(mockMarkParticipants).toHaveBeenCalledWith(expect.objectContaining(mockEvent), 'invited', 'ALO')

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        classes: mockEvent.classes,
        failed: [],
        ok: ['recipient@example.com'],
        registrations: mockRegistrations,
        startListPublished: false,
        state: mockEvent.state,
      },
      event
    )
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event:event123',
      message: 'Koekutsu luokkaan ALO lähetetty: onnistui 1, epäonnistui 0',
      messageKey: 'audit.messages.classEmailSent',
      messageParams: {
        eventClass: 'ALO',
        failed: 0,
        ok: 1,
        template: 'Koekutsu',
        templateKey: 'emailTemplate.invitation',
      },
      user: 'Test User',
    })
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith('event123', mockRegistrations, 'org-1')
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'event123' },
      { set: { startListPublished: false } },
      expect.any(String)
    )
    expect(mockPublishEventPatch).toHaveBeenCalledWith(
      {
        classes: mockEvent.classes,
        eventId: 'event123',
        startListPublished: false,
        state: mockEvent.state,
      },
      'org-1'
    )
  })

  it('does not add a class to the audit record when invitations span multiple classes', async () => {
    setEventBody(event, {
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789', 'reg012'],
      template: 'invitation',
      text: 'Test message',
    })
    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce([
      ...mockRegistrations,
      { class: 'AVO', eventId: 'event123', id: 'reg012', state: 'ready' },
    ])

    await sendMessagesLambda(event)

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Koekutsu lähetetty: onnistui 1, epäonnistui 0',
        messageKey: 'audit.messages.emailSent',
        messageParams: expect.not.objectContaining({ eventClass: expect.anything() }),
      })
    )
  })

  it('sends picked emails and marks participants as picked', async () => {
    setEventBody(event, {
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
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event:event123',
      message: 'Koepaikkailmoitus luokkaan ALO lähetetty: onnistui 1, epäonnistui 0',
      messageKey: 'audit.messages.classEmailSent',
      messageParams: {
        eventClass: 'ALO',
        failed: 0,
        ok: 1,
        template: 'Koepaikkailmoitus',
        templateKey: 'emailTemplate.picked',
      },
      user: 'Test User',
    })
  })

  it('preserves an existing start list publication value when sending invitations', async () => {
    mockRead.mockResolvedValueOnce({ ...mockEvent, startListPublished: true })

    await sendMessagesLambda(event)

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockPublishEventPatch).toHaveBeenCalledWith(expect.objectContaining({ startListPublished: true }), 'org-1')
  })

  it('sends reserve emails and marks registrations as notified', async () => {
    setEventBody(event, {
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
    setEventBody(event, {
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
        startListPublished: false,
        state: mockEvent.state,
      },
      event
    )
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event:event123',
      details: [
        {
          detailKey: 'audit.details.failedRecipients',
          detailParams: { recipients: 'recipient@example.com' },
        },
      ],
      message: 'Koekutsu luokkaan ALO lähetetty: onnistui 0, epäonnistui 1',
      messageKey: 'audit.messages.classEmailSent',
      messageParams: {
        eventClass: 'ALO',
        failed: 1,
        ok: 0,
        template: 'Koekutsu',
        templateKey: 'emailTemplate.invitation',
      },
      user: 'Test User',
    })
  })

  it('does not return or broadcast registration workflow state', async () => {
    let published: Array<Record<string, unknown>> = []
    let returned: Array<Record<string, unknown>> = []
    mockPublishRegistrationPatches.mockImplementation((_eventId: string, patches: Array<Record<string, unknown>>) => {
      published = patches
    })
    mockResponse.mockImplementation((_status: number, body: { registrations: Array<Record<string, unknown>> }) => {
      returned = body.registrations
    })
    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce([
      {
        ...mockRegistrations[0],
        creationIdempotencyKey: 'secret',
        newRegistrationLease: { expiresAt: 123, token: 'lease-token' },
        newRegistrationPublishedAt: '2026-01-01T00:00:00.000Z',
      },
      mockRegistrations[1],
    ])

    await sendMessagesLambda(event)

    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.any(String)
    )
    expect(mockResponse).toHaveBeenCalledWith(expect.any(Number), expect.any(Object), expect.anything())
    for (const registration of [...published, ...returned]) {
      expect(registration).not.toHaveProperty('creationIdempotencyKey')
      expect(registration).not.toHaveProperty('newRegistrationLease')
      expect(registration).not.toHaveProperty('newRegistrationPublishedAt')
    }
  })

  it('does not mark participants when only one registration ID is provided with invitation template', async () => {
    // Modify the parsed JSON to have only one registration ID
    setEventBody(event, {
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
    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce(singleRegistration)

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
    setEventBody(event, {
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
    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce(singleRegistration)

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
    // getReadyRegistrationsByEventId already filters non-ready registrations
    // so it returns only the ready ones (reg999 with state 'cancelled' is excluded)
    const readyRegistrations = [
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

    // Add reg999 to the requested IDs - it won't be returned since it's not ready
    setEventBody(event, {
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789', 'reg999'],
      template: 'invitation',
      text: 'Test message',
    })

    // Return only ready registrations (cancelled one is filtered out by getReadyRegistrationsByEventId)
    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce(readyRegistrations)

    await sendMessagesLambda(event)

    // Should fail because reg999 is not in the ready registrations
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

    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce(multiClassRegistrations)

    const testEvent = {
      classes: [
        { class: 'ALO', state: 'draft' },
        { class: 'AVO', state: 'draft' },
      ],
      id: 'event123',
      organizer: { id: 'org-1' },
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

    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce(sameClassRegistrations)
    setEventBody(event, {
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

    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce(allReceivedRegistrations)
    setEventBody(event, {
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

    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce(mixedGroupRegistrations)
    setEventBody(event, {
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

    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce(noClassRegistrations)
    setEventBody(event, {
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
    setEventBody(event, {
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789'],
      template: 'invitation',
      text: 'Test message',
    })

    await sendMessagesLambda(event)
    expect(mockMarkParticipants).toHaveBeenCalledWith(expect.anything(), 'invited', expect.anything())

    // Reset mocks
    vi.clearAllMocks()

    // Test with picked template
    setEventBody(event, {
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789'],
      template: 'picked',
      text: 'Test message',
    })
    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce(mockRegistrations)
    mockRead.mockResolvedValueOnce(mockEvent)
    mockSendTemplatedEmailToEventRegistrations.mockResolvedValueOnce({
      failed: [],
      ok: ['recipient@example.com'],
    })

    await sendMessagesLambda(event)
    expect(mockMarkParticipants).toHaveBeenCalledWith(expect.anything(), 'picked', expect.anything())
  })
})
