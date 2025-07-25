import type { JsonRegistration, JsonRegistrationGroupInfo, JsonUser } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'

import { jest } from '@jest/globals'

import { eventWithALOClassInvited, eventWithParticipantsInvited } from '../../__mockData__/events'
import {
  jsonRegistrationsToEventWithALOInvited,
  jsonRegistrationsToEventWithParticipantsInvited,
} from '../../__mockData__/registrations'
import { constructAPIGwEvent } from '../test-utils/helpers'

jest.unstable_mockModule('../lib/api-gw', () => ({
  getOrigin: jest.fn(),
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: jest.fn(),
}))

const mockDynamoDB: jest.Mocked<CustomDynamoClient> = {
  write: jest.fn(),
  // @ts-expect-error types don't quite match
  query: jest.fn(),
  update: jest.fn(),
  // @ts-expect-error types don't quite match
  read: jest.fn(),
}

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => mockDynamoDB),
}))

const libRegistration = await import('../lib/registration')

const mockSend = jest.fn(() => ({ ok: [], failed: [] }))

jest.unstable_mockModule('../lib/registration', () => ({
  ...libRegistration,
  sendTemplatedEmailToEventRegistrations: mockSend,
}))

const { authorize } = await import('../lib/auth')
const authorizeMock = authorize as jest.Mock<typeof authorize>

const mockBroadcast = jest.fn()
jest.unstable_mockModule('../lib/broadcast', () => ({
  __esModule: true,
  broadcastEvent: mockBroadcast,
}))

const { default: putRegistrationGroupsLambda } = await import('./handler')

const mockUser: JsonUser = {
  id: '',
  createdAt: '',
  createdBy: 'test',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
  email: 'test@example.com',
}

describe('putRegistrationGroupsLambda', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  const mockConsoleError = jest.spyOn(console, 'error')

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should return 401 if authorization fails', async () => {
    authorizeMock.mockResolvedValueOnce(null)
    const res = await putRegistrationGroupsLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(401)
  })

  it.each([undefined, null, [], {}])('should return 422 with invalid groups: %p', async (groups) => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    const res = await putRegistrationGroupsLambda(constructAPIGwEvent(groups))

    expect(res.statusCode).toEqual(422)
  })

  it('shoud return 422 with groups to not belonging to event', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    const mockGroup = {
      eventId: 'incorrect-event-id',
      id: 'whatever',
      group: { key: 'reserve', number: 1 },
      cancelled: false,
    }
    authorizeMock.mockResolvedValueOnce(mockUser)
    mockConsoleError.mockImplementationOnce(() => undefined)

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent([mockGroup] as JsonRegistrationGroupInfo[], { pathParameters: { eventId: event.id } })
    )
    expect(res.statusCode).toEqual(422)
    expect(mockConsoleError).toHaveBeenCalledWith(`no groups after filtering by eventId='${event.id}'`, [mockGroup])
    expect(mockConsoleError).toHaveBeenCalledTimes(1)
  })

  it('should move from cancelled to reserve', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeMock.mockResolvedValueOnce(mockUser)

    // stored registrations before update
    mockDynamoDB.query.mockResolvedValueOnce(jsonRegistrationsToEventWithParticipantsInvited)

    // event
    mockDynamoDB.read.mockResolvedValueOnce(event)

    const updated: JsonRegistration[] = jsonRegistrationsToEventWithParticipantsInvited.map((r) => ({ ...r }))
    const reg = updated[4]
    expect(reg.cancelled).toBe(true)

    reg.group = { key: 'reserve', number: 3 }
    reg.cancelled = false

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [{ eventId: event.id, id: reg.id, group: reg.group, cancelled: false }] as JsonRegistrationGroupInfo[],
        {
          pathParameters: { eventId: event.id },
        }
      )
    )
    expect(mockDynamoDB.update).toHaveBeenCalledTimes(2)
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      1,
      { eventId: 'testInvited', id: 'testInvited5' },
      {
        set: {
          cancelled: false,
          group: { key: 'reserve', number: 3 },
        },
      },
      'registration-table-not-found-in-env'
    )
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      2,
      { id: 'testInvited' },
      {
        set: {
          classes: [
            { class: 'ALO', date: expect.any(String), entries: 5, members: 0, places: 3 },
            { class: 'AVO', date: expect.any(String), entries: 2, members: 0, places: 1 },
          ],
          entries: 7,
          members: 0,
        },
      },
      'event-table-not-found-in-env'
    )

    expect(res.statusCode).toBe(200)
    const resultItems: JsonRegistration[] = JSON.parse(res.body).items
    const resultItem = resultItems.find((r) => r.id === reg.id)
    expect(resultItem?.cancelled).toBe(false)
    expect(resultItem?.group).toEqual(reg.group)
  })

  it('should move to last place', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeMock.mockResolvedValueOnce(mockUser)

    // stored registrations before update
    mockDynamoDB.query.mockResolvedValueOnce(jsonRegistrationsToEventWithParticipantsInvited)

    // event
    mockDynamoDB.read.mockResolvedValueOnce(event)

    const updated: JsonRegistration[] = jsonRegistrationsToEventWithParticipantsInvited.map((r) => ({ ...r }))
    const reg = updated[5]

    reg.group = { key: 'reserve', number: 3 } // move from place 1 to place 3
    reg.cancelled = false

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [{ eventId: event.id, id: reg.id, group: reg.group, cancelled: false }] as JsonRegistrationGroupInfo[],
        {
          pathParameters: { eventId: event.id },
        }
      )
    )
    expect(mockDynamoDB.update).toHaveBeenCalledTimes(3)
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      1,
      { eventId: 'testInvited', id: 'testInvited7' },
      {
        set: {
          cancelled: false,
          group: { key: 'reserve', number: 1 },
        },
      },
      'registration-table-not-found-in-env'
    )
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      2,
      { eventId: 'testInvited', id: 'testInvited6' },
      {
        set: {
          cancelled: false,
          group: { key: 'reserve', number: 2 },
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
            { class: 'AVO', date: expect.any(String), entries: 2, members: 0, places: 1 },
          ],
          entries: 6,
          members: 0,
        },
      },
      'event-table-not-found-in-env'
    )

    expect(res.statusCode).toBe(200)
  })

  it('should not send "reserve" message, when reserve is not notified', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeMock.mockResolvedValueOnce(mockUser)

    // stored registrations before update
    mockDynamoDB.query.mockResolvedValueOnce(jsonRegistrationsToEventWithParticipantsInvited)

    // event
    mockDynamoDB.read.mockResolvedValueOnce(event)

    const updated = jsonRegistrationsToEventWithParticipantsInvited.map((r) => ({ ...r }))

    // switch the two reserve-registrations positions
    updated[5].group = { ...updated[5].group, number: 2, key: 'reserve' }
    updated[6].group = { ...updated[6].group, number: 1, key: 'reserve' }

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [
          { eventId: event.id, id: updated[6].id, group: updated[6].group, cancelled: false },
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
    authorizeMock.mockResolvedValueOnce(mockUser)

    // stored registrations before update
    const storedItems = jsonRegistrationsToEventWithParticipantsInvited.map((r) => ({
      ...r,
      reserveNotified: r.group?.key === 'reserve' ? true : undefined,
    }))
    mockDynamoDB.query.mockResolvedValueOnce(storedItems)

    // event
    mockDynamoDB.read.mockResolvedValueOnce(event)

    const updated: JsonRegistration[] = storedItems.map((r) => ({ ...r }))

    updated[5].group = { ...updated[5].group, number: 2, key: 'reserve' }
    updated[6].group = { ...updated[6].group, number: 1, key: 'reserve' }
    updated[5].cancelled = false
    updated[6].cancelled = false

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [
          { eventId: 'testInvited', id: updated[6].id, group: updated[6].group, cancelled: false },
          { eventId: 'testInvited', id: updated[5].id, group: updated[5].group, cancelled: false },
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
    authorizeMock.mockResolvedValueOnce(mockUser)

    // stored registrations before update
    const storedItems = jsonRegistrationsToEventWithALOInvited.map((r) => ({
      ...r,
      reserveNotified: r.group?.key === 'reserve' ? true : undefined,
    }))
    mockDynamoDB.query.mockResolvedValueOnce(storedItems)

    // event
    mockDynamoDB.read.mockResolvedValueOnce(event)

    const updated = jsonRegistrationsToEventWithALOInvited.map((r) => ({
      ...r,
      group:
        r.class === 'ALO' && r.group?.key === 'reserve' && r.group?.number === 1
          ? { date: eventWithParticipantsInvited.startDate.toISOString(), time: 'ap', number: 2, key: 'ALO-AP' }
          : r.group,
      reserveNotified: r.group?.key === 'reserve' ? true : undefined,
    }))

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [{ eventId: event.id, id: updated[5].id, group: updated[5].group }] as JsonRegistrationGroupInfo[],
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
    authorizeMock.mockResolvedValueOnce(mockUser)

    // stored registrations before update
    mockDynamoDB.query.mockResolvedValueOnce(jsonRegistrationsToEventWithParticipantsInvited)

    // event
    mockDynamoDB.read.mockResolvedValueOnce(event)

    const updated: JsonRegistration[] = jsonRegistrationsToEventWithParticipantsInvited.map((r) => ({ ...r }))
    const reg = updated[3]
    expect(reg.cancelled).toBe(false)

    reg.group = { key: 'cancelled', number: 1 }

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent(
        [
          { eventId: event.id, id: reg.id, group: reg.group, cancelled: true, cancelReason: 'test' },
        ] as JsonRegistrationGroupInfo[],
        {
          pathParameters: { eventId: event.id },
        }
      )
    )
    expect(mockDynamoDB.update).toHaveBeenCalledTimes(2)
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      1,
      { eventId: 'testInvited', id: 'testInvited4' },
      {
        set: {
          cancelled: true,
          group: { key: 'cancelled', number: 1 },
          cancelReason: 'test',
        },
      },
      'registration-table-not-found-in-env'
    )
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      2,
      { id: 'testInvited' },
      {
        set: {
          classes: [
            { class: 'ALO', date: expect.any(String), entries: 4, members: 0, places: 3 },
            { class: 'AVO', date: expect.any(String), entries: 1, members: 0, places: 1 },
          ],
          entries: 5,
          members: 0,
        },
      },
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
  })
})
