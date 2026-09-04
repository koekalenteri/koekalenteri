import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { asJsonConfirmedEvent, constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockAudit = vi.fn()
const mockEventAuditKey = vi.fn(({ id }) => `event:${id}`)
const mockAuthorizeWithMemberOf = vi.fn()
const mockGetAuthorizedEvent = vi.fn()
const mockLockRegistrationGroups = vi.fn()
const mockReleaseLock = vi.fn()
const mockGetRegistrationsByEventId = vi.fn()
const mockUpdateRegistrationField = vi.fn()
const mockUpdate = vi.fn()
const mockPublishRegistrationPatches = vi.fn()
const mockPublishEventPatch = vi.fn()

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

vi.doMock('../lib/audit', () => ({ audit: mockAudit, eventAuditKey: mockEventAuditKey }))
vi.doMock('../lib/auth', () => ({ authorizeWithMemberOf: mockAuthorizeWithMemberOf }))
vi.doMock('../lib/eventAuth', () => ({ getAuthorizedEvent: mockGetAuthorizedEvent }))
vi.doMock('../lib/event', () => ({ lockRegistrationGroups: mockLockRegistrationGroups }))
vi.doMock('../lib/registration', () => ({
  getRegistrationsByEventId: mockGetRegistrationsByEventId,
  updateRegistrationField: mockUpdateRegistrationField,
}))
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { update: mockUpdate }
  }),
}))
vi.doMock('../lib/ws/actions', () => ({
  publishEventPatch: mockPublishEventPatch,
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

const { default: putStartNumbersLambda } = await import('./handler')

const confirmedEvent = () =>
  asJsonConfirmedEvent({
    classes: [{ class: 'ALO' }],
    id: 'event-1',
    organizer: { id: 'org-1', name: 'Org' },
    startListPublished: { ALO: true },
    startNumbersPublished: { ALO: false },
    state: 'invited',
  })

const registration = (id: string, overrides: Partial<JsonRegistration> = {}): JsonRegistration =>
  ({
    class: 'ALO',
    eventId: 'event-1',
    eventType: 'NOME-B',
    group: { date: '2026-09-12', key: 'ALO-AP', number: Number(id.slice(-1)), time: 'ap' },
    id,
    ...overrides,
  }) as JsonRegistration

const apiEvent = (body: unknown): APIGatewayProxyEvent =>
  constructPartialAPIGwEvent({ body: JSON.stringify(body), headers: {} })

describe('putStartNumbersLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetParam.mockReturnValue('event-1')
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org-1'], user: { id: 'u1', name: 'Sihteeri' } })
    mockGetAuthorizedEvent.mockResolvedValue(confirmedEvent())
    mockLockRegistrationGroups.mockResolvedValue(mockReleaseLock)
    mockGetRegistrationsByEventId.mockResolvedValue([registration('run-1'), registration('run-2')])
  })

  it('publishing freezes the class and flips the flag in the same locked request', async () => {
    await putStartNumbersLambda(apiEvent({ eventClass: 'ALO', published: true }))

    // The snapshot and the flag cannot land in different states: both happen under the groups lock.
    expect(mockLockRegistrationGroups).toHaveBeenCalledWith('event-1', 8)
    expect(mockReleaseLock).toHaveBeenCalled()
    expect(mockUpdateRegistrationField).toHaveBeenCalledWith(
      'event-1',
      'run-1',
      'startGroup',
      expect.objectContaining({ number: 1 })
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'event-1' },
      { set: { startNumbersPublished: { ALO: true }, updatedAt: expect.any(String) } },
      expect.anything()
    )
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Starttinumerot julkaistu (ALO)', user: 'Sihteeri' })
    )
    expect(mockPublishRegistrationPatches).toHaveBeenCalled()
    // The notice above the rows lives on the event, so the event patch has to go out too, or an open
    // start list keeps saying the order is unconfirmed while showing the numbers (KOE-1352).
    expect(mockPublishEventPatch).toHaveBeenCalledWith(
      { eventId: 'event-1', startNumbersPublished: { ALO: true }, updatedAt: expect.any(String) },
      'org-1'
    )

    const [status, payload] = mockResponse.mock.calls[0]
    expect(status).toBe(200)
    expect(payload.event.startNumbersPublished).toEqual({ ALO: true })
  })

  it('publishes one day of a multi-day class and leaves the other day alone (KOE-1304)', async () => {
    mockGetAuthorizedEvent.mockResolvedValue(
      asJsonConfirmedEvent({
        ...confirmedEvent(),
        classes: [
          { class: 'ALO', date: '2026-09-12' },
          { class: 'ALO', date: '2026-09-13' },
        ],
        endDate: '2026-09-13',
        startDate: '2026-09-12',
      })
    )
    mockGetRegistrationsByEventId.mockResolvedValue([
      registration('run-1'),
      registration('run-2', { group: { date: '2026-09-13', key: 'ALO-AP', number: 2, time: 'ap' } }),
    ])

    await putStartNumbersLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true }))

    // Friday freezes; Saturday's draw is tomorrow morning and its working order must not go out.
    expect(mockUpdateRegistrationField).toHaveBeenCalledTimes(1)
    expect(mockUpdateRegistrationField).toHaveBeenCalledWith(
      'event-1',
      'run-1',
      'startGroup',
      expect.objectContaining({ number: 1 })
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'event-1' },
      { set: { startNumbersPublished: { ALO: ['2026-09-12'] }, updatedAt: expect.any(String) } },
      expect.anything()
    )
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Starttinumerot julkaistu (ALO, 12.9.2026)' })
    )
  })

  it('refuses a malformed day', async () => {
    await putStartNumbersLambda(apiEvent({ date: '12.9.2026', eventClass: 'ALO', published: true }))

    expect(mockResponse).toHaveBeenCalledWith(422, 'invalid date', expect.anything())
    expect(mockLockRegistrationGroups).not.toHaveBeenCalled()
  })

  it('refuses to publish numbers for a class whose list is not out', async () => {
    mockGetAuthorizedEvent.mockResolvedValue({
      ...confirmedEvent(),
      startListPublished: { ALO: false },
    })

    await expect(putStartNumbersLambda(apiEvent({ eventClass: 'ALO', published: true }))).rejects.toThrow(
      'Start list is not published'
    )
    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
  })

  it('hiding only flips the flag: the frozen numbers stay put', async () => {
    mockGetAuthorizedEvent.mockResolvedValue({
      ...confirmedEvent(),
      startNumbersPublished: { ALO: true },
    })

    await putStartNumbersLambda(apiEvent({ eventClass: 'ALO', published: false }))

    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'event-1' },
      { set: { startNumbersPublished: { ALO: false }, updatedAt: expect.any(String) } },
      expect.anything()
    )
    // Withdrawing has to reach an open list as surely as publishing: its rows are still showing
    // numbers the public may no longer see (KOE-1352).
    expect(mockPublishEventPatch).toHaveBeenCalledWith(
      { eventId: 'event-1', startNumbersPublished: { ALO: false }, updatedAt: expect.any(String) },
      'org-1'
    )
  })

  it('writes drawn numbers through the same endpoint', async () => {
    mockGetRegistrationsByEventId.mockResolvedValue([
      registration('run-1', { startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 1, time: 'ap' } }),
    ])

    await putStartNumbersLambda(apiEvent({ eventClass: 'ALO', numbers: [{ id: 'run-1', startNumber: 4 }] }))

    expect(mockUpdateRegistrationField).toHaveBeenCalledWith(
      'event-1',
      'run-1',
      'startGroup',
      expect.objectContaining({ number: 4 })
    )
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Starttinumerot syötetty 1 koiralle (ALO)' })
    )
    // Entering the draw changes no publication state, so the event is left where it stands.
    expect(mockPublishEventPatch).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('releases the lock when a validation refuses the write', async () => {
    await expect(
      putStartNumbersLambda(apiEvent({ eventClass: 'ALO', numbers: [{ id: 'run-1', startNumber: 0 }] }))
    ).rejects.toThrow("Invalid start number '0'")

    expect(mockReleaseLock).toHaveBeenCalled()
  })
})
