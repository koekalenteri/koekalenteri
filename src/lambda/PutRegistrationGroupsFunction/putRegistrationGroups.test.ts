import type { JsonRegistrationGroupInfo, JsonUser } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'

import { jest } from '@jest/globals'

import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { registrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import { constructAPIGwEvent } from '../test-utils/helpers'

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: jest.fn(),
  getOrigin: jest.fn(),
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

const mockSend = jest.fn(() => ({ ok: [], failed: [] }))
jest.unstable_mockModule('../lib/registration', () => ({
  sendTemplatedEmailToEventRegistrations: mockSend,
}))

const { authorize } = await import('../lib/auth')
const authorizeMock = authorize as jest.Mock<typeof authorize>

const { default: putRegistrationGroupsHandler } = await import('./handler')

const mockUser: JsonUser = {
  id: '',
  createdAt: '',
  createdBy: 'test',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
  email: 'test@example.com',
}

describe('putRegistrationGroupsHandler', () => {
  afterEach(() => {
    mockSend.mockClear()
  })

  it('should return 401 if authorization fails', async () => {
    authorizeMock.mockResolvedValueOnce(null)
    const res = await putRegistrationGroupsHandler(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(401)
  })

  it.each([undefined, null, [], {}])('should return 422 with invalid groups: %p', async (groups) => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    const res = await putRegistrationGroupsHandler(constructAPIGwEvent(groups))

    expect(res.statusCode).toEqual(422)
  })

  it('should not send "reserve" message, when reserve is not notified', async () => {
    const event = eventWithParticipantsInvited
    authorizeMock.mockResolvedValueOnce(mockUser)

    // stored registrations before update
    mockDynamoDB.query.mockResolvedValueOnce(registrationsToEventWithParticipantsInvited)

    const updated = registrationsToEventWithParticipantsInvited.map((r) => ({ ...r }))

    updated[5].group = { ...updated[5].group, number: 2, key: 'reserve' }
    updated[6].group = { ...updated[6].group, number: 1, key: 'reserve' }

    // stored registrations after update
    mockDynamoDB.query.mockResolvedValueOnce(updated)

    // event
    mockDynamoDB.read.mockResolvedValueOnce(event)

    const res = await putRegistrationGroupsHandler(
      constructAPIGwEvent(
        [
          { eventId: 'testInvited', id: updated[6].id, group: updated[6].group, cancelled: false },
        ] as JsonRegistrationGroupInfo[],
        { pathParameters: { eventId: 'testInvited' } }
      )
    )

    expect(mockSend).toHaveBeenNthCalledWith(1, 'picked', event, [], undefined, '', 'Test User', '')
    expect(mockSend).toHaveBeenNthCalledWith(2, 'invitation', event, [], undefined, '', 'Test User', '')
    expect(mockSend).toHaveBeenNthCalledWith(3, 'reserve', event, [], undefined, '', 'Test User', '')
    expect(mockSend).toHaveBeenNthCalledWith(4, 'registration', event, [], undefined, '', 'Test User', 'cancel')
    expect(mockSend).toHaveBeenCalledTimes(4)
    expect(res.statusCode).toBe(200)
  })

  it('should send "reserve" message, when reserve is not notified', async () => {
    const event = eventWithParticipantsInvited
    authorizeMock.mockResolvedValueOnce(mockUser)

    // stored registrations before update
    mockDynamoDB.query.mockResolvedValueOnce(registrationsToEventWithParticipantsInvited)

    const updated = registrationsToEventWithParticipantsInvited.map((r) => ({
      ...r,
      reserveNotified: r.group?.key === 'reserve' ? true : undefined,
    }))

    updated[5].group = { ...updated[5].group, number: 2, key: 'reserve' }
    updated[6].group = { ...updated[6].group, number: 1, key: 'reserve' }

    // stored registrations after update
    mockDynamoDB.query.mockResolvedValueOnce(updated)

    // event
    mockDynamoDB.read.mockResolvedValueOnce(event)

    const res = await putRegistrationGroupsHandler(
      constructAPIGwEvent(
        [
          { eventId: 'testInvited', id: updated[6].id, group: updated[6].group, cancelled: false },
        ] as JsonRegistrationGroupInfo[],
        { pathParameters: { eventId: 'testInvited' } }
      )
    )

    expect(mockSend).toHaveBeenNthCalledWith(1, 'picked', event, [], undefined, '', 'Test User', '')
    expect(mockSend).toHaveBeenNthCalledWith(2, 'invitation', event, [], undefined, '', 'Test User', '')

    expect(mockSend).toHaveBeenNthCalledWith(3, 'reserve', event, [updated[6]], undefined, '', 'Test User', '')

    expect(mockSend).toHaveBeenNthCalledWith(4, 'registration', event, [], undefined, '', 'Test User', 'cancel')
    expect(mockSend).toHaveBeenCalledTimes(4)
    expect(res.statusCode).toBe(200)
  })
})
