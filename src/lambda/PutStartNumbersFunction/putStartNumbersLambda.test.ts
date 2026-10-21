import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { answerRejections, asJsonConfirmedEvent, constructPartialAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockAudit = vi.fn()
const mockEventAuditKey = vi.fn(({ id }) => `event:${id}`)
const mockRegistrationAuditKey = vi.fn(({ eventId, id }) => `${eventId}:${id}`)
const mockAuthorizeWithMemberOf = vi.fn()
const mockGetAuthorizedEvent = vi.fn()
const mockLockRegistrationGroups = vi.fn()
const mockReleaseLock = vi.fn()
const mockReadEventRegistrations = vi.fn()
const mockUpdateRegistrationField = vi.fn()
const mockWriteEventFields = vi.fn()
const mockPublishRegistrationPatches = vi.fn()
const mockPublishEventPatch = vi.fn()
const mockPublishPublicStartList = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
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
vi.doMock('../lib/auth', () => ({ authorizeWithMemberOf: mockAuthorizeWithMemberOf }))
vi.doMock('../lib/eventAuth', () => ({ getAuthorizedEvent: mockGetAuthorizedEvent }))
vi.doMock('../lib/event', () => ({ lockRegistrationGroups: mockLockRegistrationGroups }))
vi.doMock('../lib/repositories/registrationRepository', () => ({
  readEventRegistrations: mockReadEventRegistrations,
  updateRegistrationField: mockUpdateRegistrationField,
}))
vi.doMock('../lib/repositories/eventRepository', () => ({ writeEventFields: mockWriteEventFields }))
// The real publishers run, their guard included (KOE-1583); the connection scan below them is the boundary.
const mockQueryAdminConnections = vi.fn()
vi.doMock('../lib/ws/connectionRepository', () => ({
  queryAdminConnections: mockQueryAdminConnections,
  queryPublicConnections: vi.fn().mockResolvedValue([]),
  removeConnection: vi.fn(),
}))
vi.doMock('../lib/ws/actions', () => ({
  publishEventPatch: mockPublishEventPatch,
  publishPublicStartList: mockPublishPublicStartList,
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

const { default: putStartNumbersLambda } = await import('./handler')
const actualActions = await vi.importActual<typeof import('../lib/ws/actions')>('../lib/ws/actions')

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
    // Invited: the numbers wait on the invitations as the start list does (KOE-1466).
    messagesSent: { invitation: true },
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
    mockReadEventRegistrations.mockResolvedValue([registration('run-1'), registration('run-2')])
    mockQueryAdminConnections.mockResolvedValue([])
    mockPublishRegistrationPatches.mockImplementation(actualActions.publishRegistrationPatches)
    mockPublishEventPatch.mockImplementation(actualActions.publishEventPatch)
    mockPublishPublicStartList.mockImplementation(actualActions.publishPublicStartList)
  })

  it('answers with the published numbers when the live pushes after the write fail (KOE-1583)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockQueryAdminConnections.mockRejectedValue(new Error('scan failed'))

    await putStartNumbersLambda(apiEvent({ eventClass: 'ALO', published: true }))

    expect(mockWriteEventFields).toHaveBeenCalledWith('event-1', {
      set: { startNumbersPublished: { ALO: true }, updatedAt: expect.any(String) },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, expect.anything(), expect.anything())
    expect(loggedLines(errorSpy)).toEqual([
      expect.objectContaining({ message: 'live push failed', publication: 'registration patches' }),
      expect.objectContaining({ message: 'live push failed', publication: 'admin event patch' }),
      expect.objectContaining({ message: 'live push failed', publication: 'public start list' }),
    ])
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
    expect(mockWriteEventFields).toHaveBeenCalledWith('event-1', {
      set: { startNumbersPublished: { ALO: true }, updatedAt: expect.any(String) },
    })
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        messageKey: 'audit.messages.classStartNumbersPublished',
        messageParams: { eventClass: 'ALO' },
        user: 'Sihteeri',
      })
    )
    // The class-wide line does not answer "what number does this dog have": the dog's own trail
    // carries the number the secretary sees on the work list (KOE-1355).
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event-1:run-1',
      messageKey: 'audit.messages.startNumberPublished',
      messageParams: { number: 1 },
      user: 'Sihteeri',
    })
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
    mockReadEventRegistrations.mockResolvedValue([
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
    expect(mockWriteEventFields).toHaveBeenCalledWith('event-1', {
      set: { startNumbersPublished: { ALO: ['2026-09-12'] }, updatedAt: expect.any(String) },
    })
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        messageKey: 'audit.messages.classStartNumbersPublishedDay',
        messageParams: { date: '2026-09-12', eventClass: 'ALO' },
      })
    )
  })

  it("publishes the morning's numbers while the afternoon's draw is still to come (KOE-1430)", async () => {
    mockGetAuthorizedEvent.mockResolvedValue(
      asJsonConfirmedEvent({ ...confirmedEvent(), classes: [{ class: 'ALO', date: '2026-09-12' }] })
    )
    mockReadEventRegistrations.mockResolvedValue([
      registration('run-1'),
      registration('run-2', { group: { date: '2026-09-12', key: 'ALO-IP', number: 2, time: 'ip' } }),
    ])

    await putStartNumbersLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true, time: 'ap' }))

    // The morning freezes; the afternoon's working order must not go out with it.
    expect(mockUpdateRegistrationField).toHaveBeenCalledTimes(1)
    expect(mockUpdateRegistrationField).toHaveBeenCalledWith(
      'event-1',
      'run-1',
      'startGroup',
      expect.objectContaining({ number: 1 })
    )
    expect(mockWriteEventFields).toHaveBeenCalledWith('event-1', {
      set: { startNumbersPublished: { ALO: ['2026-09-12/ap'] }, updatedAt: expect.any(String) },
    })
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        messageKey: 'audit.messages.classStartNumbersPublishedDay',
        messageParams: { date: '2026-09-12', eventClass: 'ALO', timeKey: 'audit.time.ap' },
      })
    )
  })

  it('refuses a half without its day, and a half that is not one', async () => {
    await putStartNumbersLambda(apiEvent({ eventClass: 'ALO', published: true, time: 'ap' }))
    expect(mockResponse).toHaveBeenCalledWith(422, 'invalid time', expect.anything())

    await putStartNumbersLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true, time: 'kp' }))
    expect(mockResponse).toHaveBeenLastCalledWith(422, 'invalid time', expect.anything())
    expect(mockWriteEventFields).not.toHaveBeenCalled()
  })

  it.each(['12.9.2026', '2026-02-30', '2026-13-45'])('refuses a malformed day: %s', async (date) => {
    await putStartNumbersLambda(apiEvent({ date, eventClass: 'ALO', published: true }))

    expect(mockResponse).toHaveBeenCalledWith(422, 'invalid date', expect.anything())
    expect(mockLockRegistrationGroups).not.toHaveBeenCalled()
  })

  it('refuses to publish numbers for a class whose list is not out', async () => {
    mockGetAuthorizedEvent.mockResolvedValue({
      ...confirmedEvent(),
      startListPublished: { ALO: false },
    })

    await putStartNumbersLambda(apiEvent({ eventClass: 'ALO', published: true }))

    expect(mockResponse).toHaveBeenCalledWith(
      422,
      expect.objectContaining({ publish: 'startNumbers', reason: 'startList' }),
      expect.anything()
    )
    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
    expect(mockReleaseLock).toHaveBeenCalled()
  })

  it('refuses to publish numbers while an invitation is still to go (KOE-1466)', async () => {
    mockReadEventRegistrations.mockResolvedValue([registration('run-1'), registration('run-2', { messagesSent: {} })])

    await putStartNumbersLambda(apiEvent({ eventClass: 'ALO', published: true }))

    expect(mockResponse).toHaveBeenCalledWith(
      422,
      expect.objectContaining({ publish: 'startNumbers', reason: 'invitations' }),
      expect.anything()
    )
    expect(mockWriteEventFields).not.toHaveBeenCalled()
  })

  it('hiding only flips the flag: the frozen numbers stay put', async () => {
    mockGetAuthorizedEvent.mockResolvedValue({
      ...confirmedEvent(),
      startNumbersPublished: { ALO: true },
    })

    await putStartNumbersLambda(apiEvent({ eventClass: 'ALO', published: false }))

    expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
    expect(mockWriteEventFields).toHaveBeenCalledWith('event-1', {
      set: { startNumbersPublished: { ALO: false }, updatedAt: expect.any(String) },
    })
    // Withdrawing has to reach an open list as surely as publishing: its rows are still showing
    // numbers the public may no longer see (KOE-1352).
    expect(mockPublishEventPatch).toHaveBeenCalledWith(
      { eventId: 'event-1', startNumbersPublished: { ALO: false }, updatedAt: expect.any(String) },
      'org-1'
    )
    // And the rows themselves, so the reader gets them without fetching the list (KOE-1358).
    expect(mockPublishPublicStartList).toHaveBeenCalledWith('event-1')
  })

  it('publishes the start list only after the numbers and the flag are written and the lock is released (KOE-1516)', async () => {
    // The published list's version is the time it was read, so it has to be read after the writes.
    const steps: string[] = []
    const step = (name: string) => async () => {
      await Promise.resolve()
      steps.push(name)
    }
    mockUpdateRegistrationField.mockImplementation(step('write number'))
    mockWriteEventFields.mockImplementation(step('write flag'))
    mockReleaseLock.mockImplementation(step('release lock'))
    mockPublishPublicStartList.mockImplementation(step('publish start list'))

    await putStartNumbersLambda(apiEvent({ eventClass: 'ALO', published: true }))

    expect(steps).toEqual(['write number', 'write number', 'write flag', 'release lock', 'publish start list'])
  })

  it('writes drawn numbers through the same endpoint', async () => {
    mockReadEventRegistrations.mockResolvedValue([
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
      expect.objectContaining({
        messageKey: 'audit.messages.startNumbersEnteredClass',
        messageParams: { count: 1, eventClass: 'ALO' },
      })
    )
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event-1:run-1',
      messageKey: 'audit.messages.startNumberChanged',
      messageParams: { number: 4, previous: 1 },
      user: 'Sihteeri',
    })
    // Entering the draw changes no publication state, so the event is left where it stands.
    expect(mockPublishEventPatch).not.toHaveBeenCalled()
    expect(mockWriteEventFields).not.toHaveBeenCalled()
    // The numbers are on the rows, though, so a published list has to be sent again.
    expect(mockPublishPublicStartList).toHaveBeenCalledWith('event-1')
  })

  it('releases the lock when a validation refuses the write', async () => {
    await expect(
      putStartNumbersLambda(apiEvent({ eventClass: 'ALO', numbers: [{ id: 'run-1', startNumber: 0 }] }))
    ).rejects.toThrow("Invalid start number '0'")

    expect(mockReleaseLock).toHaveBeenCalled()
  })
})
