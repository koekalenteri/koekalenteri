import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonConfirmedEvent } from '../../types'
import { vi } from 'vitest'
import { isResultsAvailableForRegistration } from '../../lib/event'
import { answerRejections, asJsonConfirmedEvent, constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockAudit = vi.fn()
const mockEventAuditKey = vi.fn(({ id }) => `event:${id}`)
const mockRegistrationAuditKey = vi.fn(({ eventId, id }) => `${eventId}:${id}`)
const mockAuthorizeWithMemberOf = vi.fn()
const mockGetAuthorizedEvent = vi.fn()
const mockUpdate = vi.fn()
const mockPublishEventPatch = vi.fn()
const mockPublishPublicStartList = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  getParam: mockGetParam,
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
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { update: mockUpdate }
  }),
}))
vi.doMock('../lib/ws/actions', () => ({ publishEventPatch: mockPublishEventPatch }))
vi.doMock('../lib/ws/publicStartList', () => ({ publishPublicStartList: mockPublishPublicStartList }))

const { default: putResultsPublishedLambda } = await import('./handler')

/** A two-day trial: ALO runs both days, AVO the first. The workflow never takes a class past 'invited'. */
const twoDays = (overrides: Partial<JsonConfirmedEvent> = {}) =>
  asJsonConfirmedEvent({
    classes: [
      { class: 'ALO', date: '2026-09-12', state: 'invited' },
      { class: 'ALO', date: '2026-09-13', state: 'invited' },
      { class: 'AVO', date: '2026-09-12', state: 'invited' },
    ],
    endDate: '2026-09-13',
    eventType: 'NOME-B',
    id: 'event-1',
    organizer: { id: 'org-1', name: 'Org' },
    startDate: '2026-09-12',
    startListPublished: true,
    state: 'invited',
    ...overrides,
  })

const apiEvent = (body: unknown): APIGatewayProxyEvent =>
  constructPartialAPIGwEvent({ body: JSON.stringify(body), headers: {} })

/** The flag the handler wrote, with the timestamp an incremental fetch needs beside it. */
const expectStored = (resultsPublished: JsonConfirmedEvent['resultsPublished']) =>
  expect(mockUpdate).toHaveBeenCalledWith(
    { id: 'event-1' },
    { set: { resultsPublished, updatedAt: expect.any(String) } },
    expect.anything()
  )

describe('putResultsPublishedLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: new Date('2026-09-13T08:00:00+03:00'), toFake: ['Date'] })
    mockGetParam.mockReturnValue('event-1')
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org-1'], user: { id: 'u1', name: 'Sihteeri' } })
    mockGetAuthorizedEvent.mockResolvedValue(twoDays())
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes the day it names and no other, though the next day has begun (KOE-1510)', async () => {
    // Sunday morning: Saturday's results go out while Sunday's are being entered.
    const event = twoDays()
    mockGetAuthorizedEvent.mockResolvedValueOnce(event)

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true }))

    expectStored({ ALO: ['2026-09-12'], AVO: false })
    expect(mockResponse).toHaveBeenCalledWith(200, { event }, expect.anything())

    // The answer is the event as the public list now reads it.
    const dog = (date: string) => ({ class: 'ALO', group: { date } })
    expect(isResultsAvailableForRegistration(event, dog('2026-09-12'))).toBe(true)
    expect(isResultsAvailableForRegistration(event, dog('2026-09-13'))).toBe(false)
  })

  it('folds the last day of a class into a plain true', async () => {
    mockGetAuthorizedEvent.mockResolvedValueOnce(twoDays({ resultsPublished: { ALO: ['2026-09-12'], AVO: false } }))

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-13', eventClass: 'ALO', published: true }))

    expectStored({ ALO: true, AVO: false })
  })

  it('stores day keys only, even beside a date an earlier write let in', async () => {
    mockGetAuthorizedEvent.mockResolvedValueOnce(
      twoDays({ resultsPublished: JSON.parse(JSON.stringify({ ALO: [new Date('2026-09-12T09:00:00.000Z')] })) })
    )

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'AVO', published: true }))

    expectStored({ ALO: ['2026-09-12'], AVO: true })
  })

  it('refuses a day that has not begun', async () => {
    vi.setSystemTime(new Date('2026-09-12T18:00:00+03:00'))

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-13', eventClass: 'ALO', published: true }))

    expect(mockResponse).toHaveBeenCalledWith(
      422,
      { error: 'publishBlocked', eventClass: 'ALO', publish: 'results', reason: 'state' },
      expect.anything()
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('refuses results on an unpublished start list, but always lets a day be hidden', async () => {
    const hidden = twoDays({ resultsPublished: { ALO: ['2026-09-12'] }, startListPublished: { ALO: false } })
    mockGetAuthorizedEvent.mockResolvedValue(hidden)

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'AVO', published: true }))
    expect(mockResponse).toHaveBeenCalledWith(
      422,
      { error: 'publishBlocked', eventClass: 'AVO', publish: 'results', reason: 'startList' },
      expect.anything()
    )

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: false }))
    expectStored({ ALO: false, AVO: false })
  })

  it('publishes a classless trial a day at a time', async () => {
    mockGetAuthorizedEvent.mockResolvedValueOnce(twoDays({ classes: [], eventType: 'NOU' }))

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', published: true }))

    expectStored(['2026-09-12'])
  })

  it.each([
    [{ date: '2026-09-12', eventClass: 'ALO' }, 'nothing to do'],
    [{ eventClass: 'ALO', published: true }, 'invalid date'],
    [{ date: '2026-09-14', eventClass: 'ALO', published: true }, 'invalid date'],
    // AVO runs on the first day only.
    [{ date: '2026-09-13', eventClass: 'AVO', published: true }, 'invalid date'],
    [{ date: '2026-09-12', eventClass: 'VOI', published: true }, 'invalid class'],
    [{ date: '2026-09-12', published: true }, 'invalid class'],
  ])('refuses %j as %s', async (body, answer) => {
    await putResultsPublishedLambda(apiEvent(body))

    expect(mockResponse).toHaveBeenCalledWith(422, answer, expect.anything())
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('refuses a class on a classless trial', async () => {
    mockGetAuthorizedEvent.mockResolvedValueOnce(twoDays({ classes: [], eventType: 'NOU' }))

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true }))

    expect(mockResponse).toHaveBeenCalledWith(422, 'invalid class', expect.anything())
  })

  it('records the day in the trail and sends it to the open lists', async () => {
    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true }))

    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event:event-1',
      messageKey: 'audit.messages.classResultsPublishedDay',
      messageParams: { date: '2026-09-12', eventClass: 'ALO' },
      user: 'Sihteeri',
    })
    expect(mockPublishEventPatch).toHaveBeenCalledWith(
      { eventId: 'event-1', resultsPublished: { ALO: ['2026-09-12'], AVO: false }, updatedAt: expect.any(String) },
      'org-1'
    )
    expect(mockPublishPublicStartList).toHaveBeenCalledWith(
      expect.objectContaining({ resultsPublished: { ALO: ['2026-09-12'], AVO: false } })
    )
  })
})
