import type { JsonRegistration, JsonRegistrationGroupInfo, JsonUser } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import { vi } from 'vitest'
import { eventWithALOClassInvited, eventWithParticipantsInvited } from '../../__mockData__/events'
import {
  jsonRegistrationsToEventWithALOInvited,
  jsonRegistrationsToEventWithParticipantsInvited,
} from '../../__mockData__/registrations'
import { constructAPIGwEvent as constructRawAPIGwEvent } from '../test-utils/helpers'

// Keep existing move fixtures concise while exercising the semantic API
// contract used by the only client.
const constructAPIGwEvent = (body: unknown, options?: Parameters<typeof constructRawAPIGwEvent>[1]) =>
  constructRawAPIGwEvent(
    Array.isArray(body)
      ? body.map((move: any) =>
          move?.eventId
            ? {
                cancelReason: move.cancelReason,
                group: { date: move.group?.date, key: move.group?.key, time: move.group?.time },
                id: move.id,
              }
            : move
        )
      : body,
    options
  )

vi.doMock('../lib/api-gw', () => ({
  getOrigin: vi.fn(),
  isAwsServiceError: vi.fn(),
}))

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: vi.fn(),
}))

const mockDynamoDB: import('vitest').Mocked<CustomDynamoClient> = {
  // @ts-expect-error types don't quite match
  query: vi.fn(),
  // @ts-expect-error types don't quite match
  read: vi.fn(),
  update: vi.fn(),
  write: vi.fn(),
}

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return mockDynamoDB
  }),
}))

const libRegistration = await import('../lib/registration')

const mockSend = vi.fn<(...args: any[]) => { failed: string[]; ok: string[] }>(() => ({ failed: [], ok: [] }))

vi.doMock('../lib/registration', () => ({
  ...libRegistration,
  sendTemplatedEmailToEventRegistrations: mockSend,
}))

const { authorizeWithMemberOf } = await import('../lib/auth')
const authorizeWithMemberOfMock = authorizeWithMemberOf as import('vitest').Mock<typeof authorizeWithMemberOf>

const _mockBroadcast = vi.fn()
const mockBroadcastAdminEvent = vi.fn()
const mockBroadcastEventRegistrations = vi.fn()
const mockBroadcastPublicEvent = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  __esModule: true,
  publishAdminEventPatch: mockBroadcastAdminEvent,
  publishEventPatch: vi.fn(),
  publishPublicEvent: mockBroadcastPublicEvent,
  publishRegistrationPatches: mockBroadcastEventRegistrations,
}))

const { default: putRegistrationGroupsLambda } = await import('./handler')

const mockUser: JsonUser = {
  admin: true,
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: '',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
}

describe('putRegistrationGroupsLambda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  afterEach(() => {
    vi.clearAllMocks()
    mockSend.mockImplementation(() => ({ failed: [], ok: [] }))
  })

  it('should return 401 if authorization fails', async () => {
    authorizeWithMemberOfMock.mockResolvedValueOnce({ res: { body: 'Unauthorized', statusCode: 401 } })
    const res = await putRegistrationGroupsLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(401)
  })

  it.each([undefined, null, [], {}])('should return 422 with invalid groups: %p', async (groups) => {
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })
    const res = await putRegistrationGroupsLambda(constructAPIGwEvent(groups))

    expect(res.statusCode).toEqual(422)
  })

  it.each([['bad'], [1]])('returns 422 for primitive move entries', async (groups) => {
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })

    const res = await putRegistrationGroupsLambda(constructRawAPIGwEvent(groups))

    expect(res.statusCode).toEqual(422)
  })

  it('returns 422 without applying any move when a batch contains a malformed entry', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })

    const res = await putRegistrationGroupsLambda(
      constructRawAPIGwEvent([{ group: { key: 'reserve' }, id: 'valid-id' }, 'malformed'], {
        pathParameters: { eventId: event.id },
      })
    )

    expect(res.statusCode).toEqual(422)
    expect(mockDynamoDB.update).not.toHaveBeenCalled()
  })

  it('accepts legacy moves containing eventId', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    const mockGroup = { eventId: 'incorrect-event-id', id: 'whatever' }
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })
    mockDynamoDB.read.mockResolvedValue(event)
    mockDynamoDB.query.mockResolvedValueOnce([])

    const res = await putRegistrationGroupsLambda(
      constructRawAPIGwEvent([{ ...mockGroup, group: { key: 'reserve' } }], {
        pathParameters: { eventId: event.id },
      })
    )
    expect(res.statusCode).toEqual(409)
    expect(mockConsoleError).not.toHaveBeenCalledWith('no valid registration group moves', expect.anything())
  })

  it('should reject users outside the event organizer before reading registrations', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    const group = {
      cancelled: false,
      eventId: event.id,
      group: { key: 'reserve', number: 1 },
      id: 'whatever',
    }
    authorizeWithMemberOfMock.mockResolvedValueOnce({
      memberOf: ['another-organizer'],
      user: { ...mockUser, admin: false },
    })
    mockDynamoDB.read.mockResolvedValueOnce(event)

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent([group] as JsonRegistrationGroupInfo[], {
        pathParameters: { eventId: event.id },
      })
    )

    expect(res.statusCode).toBe(403)
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Forbidden', message: '403 Forbidden', status: 403 })
    )
    expect(mockDynamoDB.query).not.toHaveBeenCalled()
    expect(mockDynamoDB.update).not.toHaveBeenCalled()
  })

  it('returns 409 without reading registrations when another move holds the event lock', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })
    mockDynamoDB.read.mockResolvedValueOnce(event)
    mockDynamoDB.update.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [
          {
            cancelled: false,
            eventId: event.id,
            group: { key: 'reserve', number: 1 },
            id: 'testInvited6',
          },
        ] as JsonRegistrationGroupInfo[],
        { pathParameters: { eventId: event.id } }
      )
    )

    expect(res.statusCode).toBe(409)
    expect(mockDynamoDB.query).not.toHaveBeenCalled()
    expect(mockDynamoDB.update).toHaveBeenCalledTimes(1)
  })

  it('rejects moves from multiple classes before applying any registration changes', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })
    mockDynamoDB.read.mockResolvedValueOnce(event)
    mockDynamoDB.query.mockResolvedValueOnce(jsonRegistrationsToEventWithParticipantsInvited)

    const alo = jsonRegistrationsToEventWithParticipantsInvited.find((registration) => registration.class === 'ALO')
    const avo = jsonRegistrationsToEventWithParticipantsInvited.find((registration) => registration.class === 'AVO')
    expect(alo).toBeDefined()
    expect(avo).toBeDefined()

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [
          { group: { key: 'reserve' }, id: alo?.id },
          { group: { key: 'reserve' }, id: avo?.id },
        ],
        { pathParameters: { eventId: event.id } }
      )
    )

    expect(res.statusCode).toBe(422)
    expect(mockDynamoDB.update).toHaveBeenCalledTimes(2)
    expect(mockDynamoDB.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventId: event.id }),
      expect.anything(),
      'registration-table-not-found-in-env',
      expect.anything()
    )
  })

  it('should move from cancelled to reserve', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })

    // stored registrations before update
    mockDynamoDB.query.mockResolvedValueOnce(jsonRegistrationsToEventWithParticipantsInvited)

    // event
    mockDynamoDB.read.mockResolvedValue(event)

    const updated: JsonRegistration[] = jsonRegistrationsToEventWithParticipantsInvited.map((r) => ({ ...r }))
    const reg = updated[4]
    expect(reg.cancelled).toBe(true)

    reg.group = { key: 'reserve', number: 3 }
    reg.cancelled = false

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [{ cancelled: false, eventId: event.id, group: reg.group, id: reg.id }] as JsonRegistrationGroupInfo[],
        {
          pathParameters: { eventId: event.id },
        }
      )
    )
    expect(mockDynamoDB.update).toHaveBeenCalledTimes(4)
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      1,
      { id: event.id },
      {
        set: {
          registrationGroupsLock: expect.objectContaining({ expiresAt: expect.any(Number), token: expect.any(String) }),
        },
      },
      'event-table-not-found-in-env',
      undefined,
      expect.objectContaining({
        expression: expect.stringContaining('attribute_not_exists(#registrationGroupsLock)'),
      })
    )
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      2,
      { eventId: 'testInvited', id: 'testInvited5' },
      {
        remove: ['cancelReason'],
        set: {
          cancelled: false,
          group: { key: 'reserve', number: 3 },
          updatedAt: expect.any(String),
        },
      },
      'registration-table-not-found-in-env'
    )
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      3,
      { id: 'testInvited' },
      {
        set: {
          classes: [
            { class: 'ALO', date: expect.any(String), entries: 5, members: 0, places: 3 },
            { class: 'AVO', date: expect.any(String), entries: 2, members: 0, places: 1 },
          ],
          entries: 7,
          members: 0,
          updatedAt: expect.any(String),
        },
      },
      'event-table-not-found-in-env'
    )
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      3,
      { id: event.id },
      expect.objectContaining({
        set: expect.objectContaining({
          entries: 7,
          members: 0,
        }),
      }),
      'event-table-not-found-in-env'
    )

    expect(res.statusCode).toBe(200)
    const resultItems: JsonRegistration[] = JSON.parse(res.body).items
    const resultItem = resultItems.find((r) => r.id === reg.id)
    expect(resultItem?.cancelled).toBe(false)
    expect(resultItem?.group).toEqual(reg.group)
    expect(mockBroadcastEventRegistrations).toHaveBeenCalledWith(
      event.id,
      expect.arrayContaining([
        {
          cancelled: false,
          cancelReason: null,
          eventId: event.id,
          group: reg.group,
          id: reg.id,
        },
      ]),
      event.organizer.id
    )
    expect(mockBroadcastEventRegistrations).toHaveBeenLastCalledWith(
      event.id,
      expect.not.arrayContaining([expect.objectContaining({ dog: expect.anything() })]),
      event.organizer.id
    )
  })

  it('should move to last place', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })

    // stored registrations before update
    mockDynamoDB.query.mockResolvedValueOnce(jsonRegistrationsToEventWithParticipantsInvited)

    // event
    mockDynamoDB.read.mockResolvedValue(event)

    const updated: JsonRegistration[] = jsonRegistrationsToEventWithParticipantsInvited.map((r) => ({ ...r }))
    const reg = updated[5]

    reg.group = { key: 'reserve', number: 3 } // move from place 1 to place 3
    reg.cancelled = false

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [{ cancelled: false, eventId: event.id, group: reg.group, id: reg.id }] as JsonRegistrationGroupInfo[],
        {
          pathParameters: { eventId: event.id },
        }
      )
    )
    expect(mockDynamoDB.update).toHaveBeenCalledTimes(5)
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      2,
      { eventId: 'testInvited', id: 'testInvited7' },
      {
        set: {
          cancelled: false,
          group: { key: 'reserve', number: 1 },
          updatedAt: expect.any(String),
        },
      },
      'registration-table-not-found-in-env'
    )
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      3,
      { eventId: 'testInvited', id: 'testInvited6' },
      {
        set: {
          cancelled: false,
          group: { key: 'reserve', number: 2 },
          updatedAt: expect.any(String),
        },
      },
      'registration-table-not-found-in-env'
    )
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      4,
      { id: 'testInvited' },
      {
        set: {
          classes: [
            { class: 'ALO', date: expect.any(String), entries: 4, members: 0, places: 3 },
            { class: 'AVO', date: expect.any(String), entries: 2, members: 0, places: 1 },
          ],
          entries: 6,
          members: 0,
          updatedAt: expect.any(String),
        },
      },
      'event-table-not-found-in-env'
    )

    expect(res.statusCode).toBe(200)
  })

  it('publishes group field removals when moving a participant to reserve', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    const registration = jsonRegistrationsToEventWithParticipantsInvited[0]
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })
    mockDynamoDB.query.mockResolvedValueOnce(jsonRegistrationsToEventWithParticipantsInvited)
    mockDynamoDB.read.mockResolvedValue(event)

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent([{ group: { key: 'reserve' }, id: registration.id }], {
        pathParameters: { eventId: event.id },
      })
    )

    expect(res.statusCode).toBe(200)
    expect(mockBroadcastEventRegistrations).toHaveBeenCalledWith(
      event.id,
      expect.arrayContaining([
        expect.objectContaining({
          group: expect.objectContaining({ date: null, key: 'reserve', time: null }),
          id: registration.id,
        }),
      ]),
      event.organizer.id
    )
  })

  it('should not send "reserve" message, when reserve is not notified', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })

    // stored registrations before update
    mockDynamoDB.query.mockResolvedValueOnce(jsonRegistrationsToEventWithParticipantsInvited)

    // event
    mockDynamoDB.read.mockResolvedValue(event)

    const updated = jsonRegistrationsToEventWithParticipantsInvited.map((r) => ({ ...r }))

    // switch the two reserve-registrations positions
    updated[5].group = { ...updated[5].group, key: 'reserve', number: 2 }
    updated[6].group = { ...updated[6].group, key: 'reserve', number: 1 }

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [
          { cancelled: false, eventId: event.id, group: updated[6].group, id: updated[6].id },
        ] as JsonRegistrationGroupInfo[],
        { pathParameters: { eventId: event.id } }
      )
    )

    expect(mockSend).toHaveBeenNthCalledWith(1, 'picked', event, [], undefined, '', 'Test User', '')
    expect(mockSend).toHaveBeenNthCalledWith(2, 'invitation', event, [], undefined, '', 'Test User', '')
    expect(mockSend).toHaveBeenNthCalledWith(3, 'reserve', event, [], undefined, '', 'Test User', '')
    expect(mockSend).toHaveBeenNthCalledWith(4, 'registration', event, [], undefined, '', 'Test User', 'cancel')
    expect(mockSend).toHaveBeenCalledTimes(4)
    expect(res.statusCode).toBe(200)
  })

  it('should send "reserve" message, when reserve is notified', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })

    // stored registrations before update
    const storedItems = jsonRegistrationsToEventWithParticipantsInvited.map((r) => ({
      ...r,
      reserveNotified: r.group?.key === 'reserve' ? (r.group?.number ?? 999) : undefined,
    }))
    mockDynamoDB.query.mockResolvedValueOnce(storedItems)

    // event
    mockDynamoDB.read.mockResolvedValue(event)

    const updated: JsonRegistration[] = storedItems.map((r) => ({ ...r }))

    updated[5].group = { ...updated[5].group, key: 'reserve', number: 2 }
    updated[6].group = { ...updated[6].group, key: 'reserve', number: 1 }
    updated[5].cancelled = false
    updated[6].cancelled = false

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [
          { cancelled: false, eventId: 'testInvited', group: updated[6].group, id: updated[6].id },
          { cancelled: false, eventId: 'testInvited', group: updated[5].group, id: updated[5].id },
        ] as JsonRegistrationGroupInfo[],
        { pathParameters: { eventId: event.id } }
      )
    )

    expect(mockSend).toHaveBeenNthCalledWith(1, 'picked', event, [], undefined, '', 'Test User', '')
    expect(mockSend).toHaveBeenNthCalledWith(2, 'invitation', event, [], undefined, '', 'Test User', '')

    expect(mockSend).toHaveBeenNthCalledWith(3, 'reserve', event, [updated[6]], undefined, '', 'Test User', '')

    expect(mockSend).toHaveBeenNthCalledWith(4, 'registration', event, [], undefined, '', 'Test User', 'cancel')
    expect(mockSend).toHaveBeenCalledTimes(4)
    expect(res.statusCode).toBe(200)
  })

  it('should send "invitation" message, when moved to a class that is invited (and event is only picked)', async () => {
    const event = JSON.parse(JSON.stringify(eventWithALOClassInvited))
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })

    // stored registrations before update
    const storedItems = jsonRegistrationsToEventWithALOInvited.map((r) => ({
      ...r,
      reserveNotified: r.group?.key === 'reserve' ? (r.group?.number ?? 999) : undefined,
    }))
    mockDynamoDB.query.mockResolvedValueOnce(storedItems)

    // event
    mockDynamoDB.read.mockResolvedValue(event)

    const updated = jsonRegistrationsToEventWithALOInvited.map((r) => ({
      ...r,
      group:
        r.class === 'ALO' && r.group?.key === 'reserve' && r.group?.number === 1
          ? { date: eventWithParticipantsInvited.startDate.toISOString(), key: 'ALO-AP', number: 2, time: 'ap' }
          : r.group,
      reserveNotified: r.group?.key === 'reserve' ? (r.group?.number ?? 999) : undefined,
    }))

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [{ eventId: event.id, group: updated[5].group, id: updated[5].id }] as JsonRegistrationGroupInfo[],
        { pathParameters: { eventId: event.id } }
      )
    )

    expect(mockSend).toHaveBeenNthCalledWith(1, 'picked', event, [updated[5]], undefined, '', 'Test User', '')
    expect(mockSend).toHaveBeenNthCalledWith(2, 'invitation', event, [updated[5]], undefined, '', 'Test User', '')

    expect(mockSend).toHaveBeenNthCalledWith(
      3,
      'reserve',
      event,
      [{ ...updated[6], group: { ...updated[6].group, number: 1 } }],
      undefined,
      '',
      'Test User',
      ''
    )

    expect(mockSend).toHaveBeenNthCalledWith(4, 'registration', event, [], undefined, '', 'Test User', 'cancel')
    expect(mockSend).toHaveBeenCalledTimes(4)
    expect(res.statusCode).toBe(200)
  })

  it('should update counts when moved to cancelled', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeWithMemberOfMock.mockResolvedValueOnce({ memberOf: [], user: mockUser })
    mockSend.mockImplementation(
      (
        template: string,
        _event: unknown,
        registrations: JsonRegistration[],
        _origin: unknown,
        _text: string,
        _user: string,
        context: string
      ) => {
        if (template === 'registration' && context === 'cancel') {
          for (const registration of registrations) {
            registration.lastEmail = 'Peruutus 1.1.2026 12:00'
            registration.messagesSent = { ...(registration.messagesSent ?? {}), registration: true }
          }
          return { failed: [], ok: ['handler@example.com'] }
        }

        return { failed: [], ok: [] }
      }
    )

    // stored registrations before update
    mockDynamoDB.query.mockResolvedValueOnce(jsonRegistrationsToEventWithParticipantsInvited)

    // event
    mockDynamoDB.read.mockResolvedValue(event)

    const updated: JsonRegistration[] = jsonRegistrationsToEventWithParticipantsInvited.map((r) => ({ ...r }))
    const reg = updated[3]
    expect(reg.cancelled).toBe(false)

    reg.group = { key: 'cancelled', number: 1 }

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [
          { cancelled: true, cancelReason: 'test', eventId: event.id, group: reg.group, id: reg.id },
        ] as JsonRegistrationGroupInfo[],
        {
          pathParameters: { eventId: event.id },
        }
      )
    )
    expect(mockDynamoDB.update).toHaveBeenCalledTimes(4)
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      2,
      { eventId: 'testInvited', id: 'testInvited4' },
      {
        set: {
          cancelled: true,
          cancelReason: 'test',
          group: { key: 'cancelled', number: 1 },
          updatedAt: expect.any(String),
        },
      },
      'registration-table-not-found-in-env'
    )
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      3,
      { id: 'testInvited' },
      {
        set: {
          classes: [
            { class: 'ALO', date: expect.any(String), entries: 4, members: 0, places: 3 },
            { class: 'AVO', date: expect.any(String), entries: 1, members: 0, places: 1 },
          ],
          entries: 5,
          members: 0,
          updatedAt: expect.any(String),
        },
      },
      'event-table-not-found-in-env'
    )
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      3,
      { id: event.id },
      expect.objectContaining({
        set: expect.objectContaining({
          entries: 5,
          members: 0,
        }),
      }),
      'event-table-not-found-in-env'
    )

    expect(res.statusCode).toBe(200)
    const result = JSON.parse(res.body)
    const resultItems: JsonRegistration[] = result.items
    const resultItem = resultItems.find((r) => r.id === reg.id)
    expect(resultItem?.cancelled).toBe(true)
    expect(resultItem?.group).toEqual(reg.group)
    expect(result.entries).toBe(5)
    expect(result.classes).toEqual([expect.objectContaining({ entries: 4 }), expect.objectContaining({ entries: 1 })])
    expect(mockBroadcastAdminEvent).toHaveBeenCalledWith(
      {
        classes: result.classes,
        entries: 5,
        eventId: event.id,
        members: 0,
        updatedAt: expect.any(String),
      },
      event.organizer.id
    )
    expect(mockBroadcastEventRegistrations).toHaveBeenCalledWith(
      event.id,
      expect.arrayContaining([
        expect.objectContaining({
          cancelled: true,
          cancelReason: 'test',
          eventId: event.id,
          group: { date: null, key: 'cancelled', number: 1, time: null },
          id: reg.id,
          lastEmail: 'Peruutus 1.1.2026 12:00',
          messagesSent: { registration: true },
        }),
      ]),
      event.organizer.id
    )
  })
})
