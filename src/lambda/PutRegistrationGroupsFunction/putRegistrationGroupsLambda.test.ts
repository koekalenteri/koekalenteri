import type { JsonConfirmedEvent, JsonRegistration, JsonRegistrationGroupInfo, JsonUser } from '../../types'
import type { ApplyGroupChangesResult } from '../registration/actions'
import { jest } from '@jest/globals'
import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { jsonRegistrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import { constructAPIGwEvent } from '../test-utils/helpers'

jest.unstable_mockModule('../lib/api-gw', () => ({
  getOrigin: jest.fn(),
}))

jest.unstable_mockModule('../auth/api', () => ({
  authorize: jest.fn(),
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: jest.fn(),
  registrationAuditKey: jest.fn((reg: { eventId: string; id: string }) => `${reg.eventId}/${reg.id}`),
}))

const mockApplyGroupChanges = jest.fn<(...args: any[]) => Promise<any>>()

jest.unstable_mockModule('../registration/actions', () => ({
  applyGroupChanges: mockApplyGroupChanges,
}))

const { authorize } = await import('../auth/api')
const authorizeMock = authorize as jest.Mock<typeof authorize>

const { default: putRegistrationGroupsLambda } = await import('./handler')

const mockUser: JsonUser = {
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: '',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
}

const makeDefaultActionResult = (overrides: Partial<ApplyGroupChangesResult> = {}): ApplyGroupChangesResult => ({
  cancelledItems: [] as JsonRegistration[],
  confirmedEvent: eventWithParticipantsInvited as unknown as JsonConfirmedEvent,
  emails: {
    cancelledFailed: [],
    cancelledOk: [],
    invitedFailed: [],
    invitedOk: [],
    pickedFailed: [],
    pickedOk: [],
    reserveFailed: [],
    reserveOk: [],
  },
  updatedItems: jsonRegistrationsToEventWithParticipantsInvited as JsonRegistration[],
  ...overrides,
})

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

  it('should return 422 with groups not belonging to event', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    const mockGroup = {
      cancelled: false,
      eventId: 'incorrect-event-id',
      group: { key: 'reserve', number: 1 },
      id: 'whatever',
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

  it('should return 200 with classes, entries, items and email results from action', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeMock.mockResolvedValueOnce(mockUser)

    const actionResult = makeDefaultActionResult({
      emails: {
        cancelledFailed: [],
        cancelledOk: ['cancelled@example.com'],
        invitedFailed: [],
        invitedOk: ['invited@example.com'],
        pickedFailed: [],
        pickedOk: ['picked@example.com'],
        reserveFailed: [],
        reserveOk: [],
      },
    })
    mockApplyGroupChanges.mockResolvedValueOnce(actionResult)

    const mockGroup: JsonRegistrationGroupInfo = {
      cancelled: false,
      eventId: event.id,
      group: { key: 'reserve', number: 1 },
      id: 'testInvited5',
    }

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent([mockGroup], { pathParameters: { eventId: event.id } })
    )

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.classes).toEqual(event.classes)
    expect(body.entries).toBe(event.entries)
    expect(body.items).toEqual(actionResult.updatedItems)
    expect(body.pickedOk).toEqual(['picked@example.com'])
    expect(body.invitedOk).toEqual(['invited@example.com'])
    expect(body.cancelledOk).toEqual(['cancelled@example.com'])
    expect(mockApplyGroupChanges).toHaveBeenCalledWith({
      eventGroups: [mockGroup],
      eventId: event.id,
      origin: undefined,
      user: mockUser,
    })
  })

  it('should audit cancelled registrations from action result', async () => {
    const event = JSON.parse(JSON.stringify(eventWithParticipantsInvited))
    authorizeMock.mockResolvedValueOnce(mockUser)

    const cancelledReg = {
      ...jsonRegistrationsToEventWithParticipantsInvited[3],
      cancelled: true,
      group: { key: 'cancelled', number: 1 },
    } as JsonRegistration

    const actionResult = makeDefaultActionResult({ cancelledItems: [cancelledReg] })
    mockApplyGroupChanges.mockResolvedValueOnce(actionResult)

    const mockGroup: JsonRegistrationGroupInfo = {
      cancelled: true,
      eventId: event.id,
      group: { key: 'cancelled', number: 1 },
      id: cancelledReg.id,
    }

    const res = await putRegistrationGroupsLambda(
      constructAPIGwEvent([mockGroup], { pathParameters: { eventId: event.id } })
    )

    expect(res.statusCode).toBe(200)
    const { audit } = await import('../lib/audit')
    expect(audit).toHaveBeenCalledTimes(1)
  })
})
