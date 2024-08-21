import type { JsonRegistration } from '../../types'

import { jest } from '@jest/globals'

import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { registrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import { constructAPIGwEvent } from '../test-utils/helpers'

const mockEventWithInvitationAttachment = { ...eventWithParticipantsInvited, invitationAttachment: 'test.pdf' }

const mockIsParticipantGroup = jest.fn(() => true)
const mockGetRegistration = jest.fn(() => ({ ...registrationsToEventWithParticipantsInvited[0] }))

jest.unstable_mockModule('../lib/registration', () => ({
  getRegistration: mockGetRegistration,
  isParticipantGroup: mockIsParticipantGroup,
}))

const mockGetEvent = jest.fn(() => mockEventWithInvitationAttachment)

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

const { default: getRegistrationLambda } = await import('./handler')

describe('getRegistration', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

  afterEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    [undefined, undefined],
    ['123', undefined],
    [undefined, '123'],
  ])('should return 404 if eventId is %p and id is %p', async (eventId, id) => {
    const res = await getRegistrationLambda(constructAPIGwEvent('test', { pathParameters: { eventId, id } }))

    expect(res.statusCode).toEqual(404)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('should add invitationAttachment', async () => {
    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.invitationAttachment).toEqual('test.pdf')
  })

  it('should not add invitationAttachment when registration is not in participant group', async () => {
    mockIsParticipantGroup.mockReturnValueOnce(false)

    const res = await getRegistrationLambda(
      constructAPIGwEvent('test', { pathParameters: { eventId: '123', id: '123' } })
    )

    expect(res.statusCode).toEqual(200)
    const reg: JsonRegistration = JSON.parse(res.body)
    expect(reg.invitationAttachment).toBeUndefined()
  })
})
