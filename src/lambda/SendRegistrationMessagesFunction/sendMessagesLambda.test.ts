import type { JsonConfirmedEvent, JsonRegistration, Registration } from '../../types'
import { vi } from 'vitest'
import { httpError } from '../lib/lambda'
import { deliverToEntrant, everyEntrantWatching } from '../test-utils/entrantPages'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

const setEventBody = (event: { body: string | null }, body: unknown) => {
  event.body = JSON.stringify(body)
}

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockAuthorizeWithMemberOf = vi.fn()
const mockGetOrigin = vi.fn()
const mockSendTemplatedEmailToEventRegistrations = vi.fn()
const mockSetReserveNotified = vi.fn()
const mockGetReadyRegistrationsByEventId = vi.fn()
const mockMarkParticipants = vi.fn()
const mockReadEventRegistrations = vi.fn()
const mockReadRegistration = vi.fn()
const mockReadEvent = vi.fn()
const mockWriteEventFields = vi.fn()
const mockAudit = vi.fn()
const mockEventAuditKey = vi.fn()
const mockPublishEventPatch = vi.fn()
const mockPublishRegistrationPatches = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
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

vi.doMock('../lib/api-gw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api-gw')>()),
  getOrigin: mockGetOrigin,
}))

vi.doMock('../lib/audit', () => ({
  audit: mockAudit,
  eventAuditKey: mockEventAuditKey,
}))

// What each entrant's page receives. The real publisher runs; every entrant has the page open (KOE-1567).
// The admins' publishers run for real too, their guard included, on an empty audience (KOE-1583).
const mockToEntrant = vi.fn()
const mockOrganizerAudience = vi.fn()
vi.doMock('../lib/ws/connectionSelectors', () => ({
  organizerAudience: mockOrganizerAudience,
  publicAudience: async () => [],
  registrationsAudience: everyEntrantWatching,
}))
vi.doMock('../lib/ws/broadcast', () => ({ broadcast: deliverToEntrant(mockToEntrant) }))
vi.doMock('../lib/ws/actions', async () => ({
  publishEventPatch: mockPublishEventPatch,
  publishParticipantRegistrationPatches: (
    await vi.importActual<typeof import('../lib/ws/actions')>('../lib/ws/actions')
  ).publishParticipantRegistrationPatches,
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

vi.doMock('../lib/registration', async () => ({
  ...(await vi.importActual<typeof import('../lib/registration')>('../lib/registration')),
  getReadyRegistrationsByEventId: mockGetReadyRegistrationsByEventId,
  sendTemplatedEmailToEventRegistrations: mockSendTemplatedEmailToEventRegistrations,
  setReserveNotified: mockSetReserveNotified,
}))

vi.doMock('../lib/event', async () => ({
  ...(await vi.importActual<typeof import('../lib/event')>('../lib/event')),
  markParticipants: mockMarkParticipants,
}))

// lib/payment reads the stored row the entrant's patch is built from.
vi.doMock('../lib/repositories/registrationRepository', () => ({
  readEventRegistrations: mockReadEventRegistrations,
  readRegistration: mockReadRegistration,
}))

vi.doMock('../lib/repositories/eventRepository', () => ({
  readEvent: mockReadEvent,
  writeEventFields: mockWriteEventFields,
}))

const { default: sendMessagesLambda } = await import('./handler')
const actualActions = await vi.importActual<typeof import('../lib/ws/actions')>('../lib/ws/actions')

describe('sendMessagesLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: JSON.stringify({
      contactInfo: { email: 'contact@example.com' },
      eventId: 'event123',
      registrationIds: ['reg456', 'reg789'],
      template: 'invitation',
      text: 'Test message',
    }),
    headers: {},
  })

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
    mockOrganizerAudience.mockResolvedValue([])
    mockPublishRegistrationPatches.mockImplementation(actualActions.publishRegistrationPatches)
    mockPublishEventPatch.mockImplementation(actualActions.publishEventPatch)

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
    mockReadEvent.mockResolvedValue({ ...mockEvent })

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
    mockAuthorizeWithMemberOf.mockRejectedValueOnce(httpError(401, 'Unauthorized'))

    await sendMessagesLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
  })

  it('rejects users outside the event organizer before reading registrations or sending messages', async () => {
    mockReadEvent.mockResolvedValueOnce({ ...mockEvent, organizer: { id: 'org-2' } })

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
    mockReadEvent.mockResolvedValueOnce(null)

    await sendMessagesLambda(event)

    expect(mockReadEvent).toHaveBeenCalledWith('event123')
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
      expect.objectContaining({ name: 'Test User' }),
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
      messageKey: 'audit.messages.classEmailSent',
      messageParams: {
        eventClass: 'ALO',
        failed: 0,
        ok: 1,
        template: 'invitation',
        templateKey: 'emailTemplate.invitation',
      },
      user: 'Test User',
    })
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith('event123', mockRegistrations, 'org-1')
    expect(mockWriteEventFields).toHaveBeenCalledWith('event123', { set: { startListPublished: false } })
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
      expect.objectContaining({ name: 'Test User' }),
      expect.any(String)
    )

    // Verify participants were marked
    expect(mockMarkParticipants).toHaveBeenCalledWith(mockEvent, 'picked', 'ALO')
    expect(mockWriteEventFields).not.toHaveBeenCalled()
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event:event123',
      messageKey: 'audit.messages.classEmailSent',
      messageParams: {
        eventClass: 'ALO',
        failed: 0,
        ok: 1,
        template: 'picked',
        templateKey: 'emailTemplate.picked',
      },
      user: 'Test User',
    })
  })

  it('preserves an existing start list publication value when sending invitations', async () => {
    mockReadEvent.mockResolvedValueOnce({ ...mockEvent, startListPublished: true })

    await sendMessagesLambda(event)

    expect(mockWriteEventFields).not.toHaveBeenCalled()
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
      expect.objectContaining({ name: 'Test User' }),
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
      expect.objectContaining({ name: 'Test User' }),
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
      messageKey: 'audit.messages.classEmailSent',
      messageParams: {
        eventClass: 'ALO',
        failed: 1,
        ok: 0,
        template: 'invitation',
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
      expect.objectContaining({ name: 'Test User' }),
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
      expect.objectContaining({ name: 'Test User' }),
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

  it('reads the event the messages are sent for', async () => {
    await sendMessagesLambda(event)

    expect(mockReadEvent).toHaveBeenCalledWith('event123')
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
    mockReadEvent.mockResolvedValueOnce(testEvent)

    await sendMessagesLambda(event)

    // Verify emails were sent
    expect(mockSendTemplatedEmailToEventRegistrations).toHaveBeenCalledWith(
      'invitation',
      expect.any(Object),
      multiClassRegistrations,
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ name: 'Test User' }),
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

  it.each([
    ['invitation', 'invited'],
    ['picked', 'picked'],
  ] as const)(
    'marks the class after %s although a cancelled entry left in a group never got it (KOE-1537)',
    async (template, state) => {
      const registrations: Partial<Registration>[] = [
        {
          class: 'ALO',
          eventId: 'event123',
          group: { key: 'group1', number: 1 },
          id: 'reg456',
          messagesSent: { [template]: true },
          state: 'ready',
        },
        {
          cancelled: true,
          class: 'ALO',
          eventId: 'event123',
          group: { key: 'group1', number: 2 },
          id: 'reg789',
          state: 'ready',
        },
      ]

      mockGetReadyRegistrationsByEventId.mockResolvedValueOnce(registrations)
      setEventBody(event, {
        contactInfo: { email: 'contact@example.com' },
        eventId: 'event123',
        registrationIds: ['reg456'],
        template,
        text: 'Test message',
      })

      await sendMessagesLambda(event)

      expect(mockMarkParticipants).toHaveBeenCalledWith(expect.anything(), state, 'ALO')
    }
  )

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
    mockReadEvent.mockResolvedValueOnce(mockEvent)
    mockSendTemplatedEmailToEventRegistrations.mockResolvedValueOnce({
      failed: [],
      ok: ['recipient@example.com'],
    })

    await sendMessagesLambda(event)
    expect(mockMarkParticipants).toHaveBeenCalledWith(expect.anything(), 'picked', expect.anything())
  })
  describe('the entrant pages (KOE-1567)', () => {
    const storedAt = '2030-01-01T00:00:00.500Z'

    /** Sends picked to three entries: one new, one that already had it, one whose send fails. */
    const sendPicked = async () => {
      const registrations: Partial<JsonRegistration>[] = [
        { class: 'ALO', eventId: 'event123', group: { key: 'group1', number: 1 }, id: 'reg-new', state: 'ready' },
        {
          class: 'ALO',
          eventId: 'event123',
          group: { key: 'group1', number: 2 },
          id: 'reg-had',
          messagesSent: { picked: true },
          state: 'ready',
        },
        { class: 'ALO', eventId: 'event123', group: { key: 'group1', number: 3 }, id: 'reg-failed', state: 'ready' },
      ]
      mockGetReadyRegistrationsByEventId.mockResolvedValueOnce(registrations)
      // The entrant's patch carries the payment picture, worked out from the event's cost.
      mockReadEvent.mockResolvedValueOnce({ ...mockEvent, cost: 50 })
      // As the real sender: a sent message is stored in messagesSent, on the row and in memory alike.
      mockSendTemplatedEmailToEventRegistrations.mockImplementationOnce(
        async (template: 'picked', _event: unknown, sentTo: Partial<JsonRegistration>[]) => {
          for (const registration of sentTo) {
            if (registration.id === 'reg-failed') continue
            const messagesSent = registration.messagesSent ?? {}
            messagesSent[template] = true
            registration.messagesSent = messagesSent
          }
          return { failed: ['failed@example.com'], ok: ['new@example.com', 'had@example.com'] }
        }
      )
      mockReadRegistration.mockImplementation(async (_eventId: string, id: string) => ({
        ...registrations.find((registration) => registration.id === id),
        updatedAt: storedAt,
      }))
      setEventBody(event, {
        contactInfo: { email: 'contact@example.com' },
        eventId: 'event123',
        registrationIds: ['reg-new', 'reg-had', 'reg-failed'],
        template: 'picked',
        text: 'Test message',
      })

      return sendMessagesLambda(event)
    }

    const expectOnlyNewEntrantTold = () => {
      expect(mockToEntrant).toHaveBeenCalledTimes(1)
      expect(mockToEntrant).toHaveBeenCalledWith(
        'event123',
        'reg-new',
        expect.objectContaining({ id: 'reg-new', messagesSent: { picked: true }, updatedAt: storedAt })
      )
    }

    it('tells each entrant whose picked message went out that it was sent, from the stored row', async () => {
      await sendPicked()

      expectOnlyNewEntrantTold()
    })

    // The mails are sent and stored before the admins hear of it: a failed admin push leaves the
    // entrant's page its confirmation request, and the answer says the mails went (KOE-1583), so the
    // secretary is not invited to send them again.
    it('answers with the sent mails and tells the entrant although the admin push fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mockOrganizerAudience.mockRejectedValue(new Error('connection scan failed'))

      await sendPicked()

      expectOnlyNewEntrantTold()
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ ok: ['new@example.com', 'had@example.com'] }),
        expect.anything()
      )
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({ message: 'live push failed', publication: 'registration patches' }),
        expect.objectContaining({ message: 'live push failed', publication: 'admin event patch' }),
      ])
    })
  })
})
