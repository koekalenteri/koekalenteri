import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { getStartNumberLinkToken } from '../lib/startNumberLink'
import { asJsonConfirmedEvent } from '../test-utils/helpers'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockAudit = vi.fn()
const mockRegistrationAuditKey = vi.fn()
const mockEventAuditKey = vi.fn()
const mockGetEvent = vi.fn()
const mockLockRegistrationGroups = vi.fn()
const mockGetRegistrationsByEventId = vi.fn()
const mockUpdateRegistrationField = vi.fn()
const mockRemoveRegistrationField = vi.fn()
const mockPublishRegistrationPatches = vi.fn()

vi.doMock('../lib/lambda', () => ({
  getParam: mockGetParam,
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

vi.doMock('../lib/audit', () => ({
  audit: mockAudit,
  eventAuditKey: mockEventAuditKey,
  registrationAuditKey: mockRegistrationAuditKey,
}))
vi.doMock('../lib/event', () => ({ getEvent: mockGetEvent, lockRegistrationGroups: mockLockRegistrationGroups }))
vi.doMock('../lib/registration', () => ({
  getRegistrationsByEventId: mockGetRegistrationsByEventId,
  removeRegistrationField: mockRemoveRegistrationField,
  updateRegistrationField: mockUpdateRegistrationField,
}))
vi.doMock('../lib/ws/actions', () => ({ publishRegistrationPatches: mockPublishRegistrationPatches }))

const { default: putClassStartNumbersLambda } = await import('./handler')

const confirmedEvent = asJsonConfirmedEvent({
  classes: [{ class: 'ALO' }, { class: 'AVO' }],
  eventType: 'NOWT',
  id: 'event-1',
  organizer: { id: 'org-1', name: 'Org' },
})

/** ALO holds 1–2 of the working order, AVO 3–4: each class draws within the numbers it holds. */
const registration = (id: string, eventClass: string, number: number) =>
  ({
    class: eventClass,
    eventId: 'event-1',
    group: { date: '2026-09-12', key: `${eventClass}-AP`, number },
    id,
  }) as JsonRegistration

const apiEvent = async (body: unknown, token?: string): Promise<APIGatewayProxyEvent> => {
  const bearer = token ?? (await getStartNumberLinkToken('event-1', confirmedEvent, 'ALO'))
  const partial: Pick<APIGatewayProxyEvent, 'body' | 'headers'> = {
    body: JSON.stringify(body),
    headers: { authorization: `Bearer ${bearer}` },
  }

  // Safe: the handler and every mocked collaborator touch only these two fields.
  return partial as APIGatewayProxyEvent
}

describe('putClassStartNumbersLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetParam.mockImplementation((_event, name: string) => (name === 'eventId' ? 'event-1' : 'ALO'))
    mockGetEvent.mockResolvedValue(confirmedEvent)
    mockLockRegistrationGroups.mockResolvedValue(vi.fn())
    mockGetRegistrationsByEventId.mockResolvedValue([
      registration('alo-1', 'ALO', 1),
      registration('alo-2', 'ALO', 2),
      registration('avo-1', 'AVO', 3),
    ])
  })

  it('writes the class draw and publishes it to the secretary watching', async () => {
    await putClassStartNumbersLambda(
      await apiEvent({
        numbers: [
          { id: 'alo-1', startNumber: 2 },
          { id: 'alo-2', startNumber: 1 },
        ],
      })
    )

    expect(mockUpdateRegistrationField).toHaveBeenCalledWith('event-1', 'alo-1', 'startGroup', expect.anything())
    const [status, payload] = mockResponse.mock.calls[0]
    expect(status).toBe(200)
    expect(payload.patches).toHaveLength(2)
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith('event-1', payload.patches, 'org-1')
  })

  it('attributes the write to the class, so the trail says who drew', async () => {
    await putClassStartNumbersLambda(await apiEvent({ numbers: [{ id: 'alo-1', startNumber: 2 }] }))

    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ user: 'Luokkasihteeri (ALO)' }))
  })

  it('refuses a number of another class, which is the whole point of the link', async () => {
    await expect(
      putClassStartNumbersLambda(await apiEvent({ numbers: [{ id: 'alo-1', startNumber: 3 }] }))
    ).rejects.toThrow('startNumberOutsideClass')

    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
  })

  it("refuses another class's dog", async () => {
    await expect(
      putClassStartNumbersLambda(await apiEvent({ numbers: [{ id: 'avo-1', startNumber: 1 }] }))
    ).rejects.toThrow('does not run in ALO')

    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
  })

  it('refuses a wrong token without reading the registrations', async () => {
    await expect(
      putClassStartNumbersLambda(await apiEvent({ numbers: [{ id: 'alo-1', startNumber: 2 }] }, 'wrong'))
    ).rejects.toThrow('not found')

    expect(mockGetRegistrationsByEventId).not.toHaveBeenCalled()
  })

  it('has nothing to do without numbers', async () => {
    await putClassStartNumbersLambda(await apiEvent({ numbers: [] }))

    expect(mockResponse).toHaveBeenCalledWith(422, 'nothing to do', expect.anything())
    expect(mockLockRegistrationGroups).not.toHaveBeenCalled()
  })
})
