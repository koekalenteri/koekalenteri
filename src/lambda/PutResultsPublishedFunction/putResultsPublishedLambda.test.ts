import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonConfirmedEvent, ResultsDayScope, ResultsPublishedState } from '../../types'
import { isDeepStrictEqual } from 'node:util'
import { vi } from 'vitest'
import { isResultsAvailableForRegistration, isResultsPublishedClassMap } from '../../lib/event'
import { isRegistrationClass } from '../../lib/registration'
import { answerRejections, asJsonConfirmedEvent, constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockAudit = vi.fn()
const mockEventAuditKey = vi.fn(({ id }) => `event:${id}`)
const mockRegistrationAuditKey = vi.fn(({ eventId, id }) => `${eventId}:${id}`)
const mockAuthorizeWithMemberOf = vi.fn()
const mockRead = vi.fn()
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
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { read: mockRead, update: mockUpdate }
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

type UpdateCondition = { expression: string; names: Record<string, string>; values?: Record<string, unknown> }

/**
 * The event row as DynamoDB would hold it: an update sets top-level fields or one entry of a map by its
 * dotted path, holds the write to the value it was folded from (the whole flag, or the class's entry),
 * and answers with the row after the write, so two requests made from the same reading can be played
 * against one row.
 */
let row: JsonConfirmedEvent

/** What the handler sets: the whole flag, or one class's entry of it by its dotted path. */
type ResultsSet = {
  resultsPublished?: ResultsPublishedState
  updatedAt?: string
  [path: `resultsPublished.${string}`]: ResultsDayScope
}

/** The stored value a condition names: the class's entry where it names one, or else the whole flag. */
const conditionedValue = ({ names }: UpdateCondition) => {
  const eventClass = names['#resultsClass']
  const flag = row.resultsPublished
  if (!eventClass) return flag
  return isResultsPublishedClassMap(flag) && isRegistrationClass(eventClass) ? flag[eventClass] : undefined
}

const holds = (condition: UpdateCondition) =>
  isDeepStrictEqual(conditionedValue(condition), condition.values?.[':resultsRead'])

const applyUpdate = async (
  _key: unknown,
  { set }: { set: ResultsSet },
  _table: unknown,
  _returnValues: unknown,
  condition: UpdateCondition
) => {
  if (!holds(condition)) {
    throw Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' })
  }
  const { resultsPublished, updatedAt, ...entries } = set
  let flag = resultsPublished ?? row.resultsPublished
  for (const [path, scope] of Object.entries(entries)) {
    flag = { ...(isResultsPublishedClassMap(flag) ? flag : {}), [path.slice('resultsPublished.'.length)]: scope }
  }
  row = { ...row, resultsPublished: flag, updatedAt: updatedAt ?? row.updatedAt }
  return { Attributes: row }
}

/** Store the event, and have every request read the row as it then is. */
const store = (event: JsonConfirmedEvent) => {
  row = event
  mockRead.mockImplementation(async () => structuredClone(row))
}

describe('putResultsPublishedLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: new Date('2026-09-13T08:00:00+03:00'), toFake: ['Date'] })
    mockGetParam.mockReturnValue('event-1')
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org-1'], user: { id: 'u1', name: 'Sihteeri' } })
    mockUpdate.mockImplementation(applyUpdate)
    store(twoDays({ updatedAt: '2026-09-13T04:00:00.000Z' }))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes the day it names and no other, though the next day has begun (KOE-1510)', async () => {
    // Sunday morning: Saturday's results go out while Sunday's are being entered.
    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true }))

    expect(row.resultsPublished).toEqual({ ALO: ['2026-09-12'], AVO: false })
    expect(row.updatedAt).toBe('2026-09-13T05:00:00.000Z')
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      { event: expect.objectContaining({ resultsPublished: row.resultsPublished }) },
      expect.anything()
    )

    // The stored event as the public list reads it.
    const dog = (date: string) => ({ class: 'ALO', group: { date } })
    expect(isResultsAvailableForRegistration(row, dog('2026-09-12'))).toBe(true)
    expect(isResultsAvailableForRegistration(row, dog('2026-09-13'))).toBe(false)
  })

  it('folds the last day of a class into a plain true, writing only that class', async () => {
    store(twoDays({ resultsPublished: { ALO: ['2026-09-12'], AVO: false } }))

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-13', eventClass: 'ALO', published: true }))

    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'event-1' },
      { set: { 'resultsPublished.ALO': true, updatedAt: expect.any(String) } },
      expect.any(String),
      'ALL_NEW',
      expect.objectContaining({ values: { ':resultsRead': ['2026-09-12'] } })
    )
    expect(row.resultsPublished).toEqual({ ALO: true, AVO: false })
  })

  it('lands two publishes made from the same reading of a class map', async () => {
    // Two secretaries, one per class, each with the event as it was before either published.
    const before = twoDays({ resultsPublished: { ALO: false, AVO: false } })
    store(before)
    mockRead.mockResolvedValueOnce(structuredClone(before)).mockResolvedValueOnce(structuredClone(before))

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true }))
    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'AVO', published: true }))

    expect(row.resultsPublished).toEqual({ ALO: ['2026-09-12'], AVO: true })
    // What the second answer sends on is the stored flag, the first secretary's day included.
    expect(mockPublishEventPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ resultsPublished: { ALO: ['2026-09-12'], AVO: true } }),
      'org-1'
    )
  })

  it('refuses the second of two writes to the same class made from one reading', async () => {
    // One secretary hides ALO's Saturday while another publishes its Sunday, both from the same row.
    const before = twoDays({ resultsPublished: { ALO: ['2026-09-12'], AVO: false } })
    store(before)
    mockRead.mockResolvedValueOnce(structuredClone(before)).mockResolvedValueOnce(structuredClone(before))

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: false }))
    await putResultsPublishedLambda(apiEvent({ date: '2026-09-13', eventClass: 'ALO', published: true }))

    // The hide stands: the publish was folded from the Saturday it no longer sees.
    expect(row.resultsPublished).toEqual({ ALO: false, AVO: false })
    expect(mockResponse).toHaveBeenLastCalledWith(409, { error: 'resultsPublishedChanged' }, expect.anything())
    expect(mockAudit).toHaveBeenCalledTimes(1)
  })

  it('refuses the second of two publishes that would each write the whole flag', async () => {
    // No map yet: the first publish turns the flag into one, so the second's reading is out of date.
    const before = twoDays()
    mockRead.mockResolvedValueOnce(structuredClone(before)).mockResolvedValueOnce(structuredClone(before))

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true }))
    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'AVO', published: true }))

    expect(row.resultsPublished).toEqual({ ALO: ['2026-09-12'], AVO: false })
    expect(mockResponse).toHaveBeenLastCalledWith(409, { error: 'resultsPublishedChanged' }, expect.anything())
    expect(mockAudit).toHaveBeenCalledTimes(1)
  })

  it('is not refused by a write to the rest of the row', async () => {
    // A registration or an invitation moved updatedAt between the read and the write; the flag is as read.
    const before = twoDays()
    store({ ...before, updatedAt: '2026-09-13T04:59:00.000Z' })
    mockRead.mockResolvedValueOnce(structuredClone(before))

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true }))

    expect(row.resultsPublished).toEqual({ ALO: ['2026-09-12'], AVO: false })
  })

  it('reads the event as last written', async () => {
    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true }))

    expect(mockRead).toHaveBeenCalledWith({ id: 'event-1' }, expect.anything(), true)
  })

  it('refuses a secretary of another organizer', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf: ['org-2'], user: { id: 'u2', name: 'Muu' } })

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true }))

    expect(mockResponse).toHaveBeenCalledWith(403, { error: 'Forbidden' }, expect.anything())
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('writes the class it publishes back as day keys, even where an earlier write let a timestamp in', async () => {
    store(twoDays({ resultsPublished: { ALO: ['2026-09-11T21:00:00.000Z'], AVO: false } }))

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: true }))

    expect(row.resultsPublished).toEqual({ ALO: ['2026-09-12'], AVO: false })
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
    store(twoDays({ resultsPublished: { ALO: ['2026-09-12'] }, startListPublished: { ALO: false } }))

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'AVO', published: true }))
    expect(mockResponse).toHaveBeenCalledWith(
      422,
      { error: 'publishBlocked', eventClass: 'AVO', publish: 'results', reason: 'startList' },
      expect.anything()
    )

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', eventClass: 'ALO', published: false }))
    expect(row.resultsPublished).toEqual({ ALO: false })
  })

  it('publishes a classless trial a day at a time', async () => {
    store(twoDays({ classes: [], eventType: 'NOU' }))

    await putResultsPublishedLambda(apiEvent({ date: '2026-09-12', published: true }))
    await putResultsPublishedLambda(apiEvent({ date: '2026-09-13', published: true }))

    expect(row.resultsPublished).toBe(true)
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
    store(twoDays({ classes: [], eventType: 'NOU' }))

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
