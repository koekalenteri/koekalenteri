import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { httpError } from '../lib/lambda'
import { answerRejections, asJsonRegistration } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'
import { registrationStore } from '../test-utils/registrationStore'

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockAuthorizeWithMemberOf = vi.fn()
const mockAudit = vi.fn()
const mockRegistrationAuditKey = vi.fn(({ eventId, id }: { eventId: string; id: string }) => `${eventId}:${id}`)
const mockGetAuthorizedEvent = vi.fn()
const mockGetEvent = vi.fn()
const registrations = registrationStore()
const storeRows = registrations.store
const mockReadEventRegistrations = vi.fn(registrations.readEventRegistrations)
const mockReadRegistration = vi.fn(registrations.readRegistration)
const mockWriteEventResult = vi.fn(registrations.writeEventResult)
const mockWrittenResult = registrations.written
const mockPublishRegistrationPatches = vi.fn()
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

vi.doMock('../lib/auth', () => ({ authorizeWithMemberOf: mockAuthorizeWithMemberOf }))
vi.doMock('../lib/audit', () => ({ audit: mockAudit, registrationAuditKey: mockRegistrationAuditKey }))
vi.doMock('../lib/eventAuth', () => ({ getAuthorizedEvent: mockGetAuthorizedEvent }))
vi.doMock('../lib/event', () => ({ getEvent: mockGetEvent }))
vi.doMock('../lib/repositories/registrationRepository', () => ({
  readEventRegistrations: mockReadEventRegistrations,
  readRegistration: mockReadRegistration,
  writeEventResult: mockWriteEventResult,
}))
// The real publishers run, their guard included (KOE-1583); the connection scan below them is the boundary.
const mockQueryAdminConnections = vi.fn()
vi.doMock('../lib/ws/connectionRepository', () => ({
  queryAdminConnections: mockQueryAdminConnections,
  queryPublicConnections: vi.fn().mockResolvedValue([]),
  removeConnection: vi.fn(),
}))
vi.doMock('../lib/ws/actions', () => ({
  publishPublicStartList: mockPublishPublicStartList,
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

const { default: putEventResultsLambda } = await import('./handler')
const actualActions = await vi.importActual<typeof import('../lib/ws/actions')>('../lib/ws/actions')

/**
 * The handler reads only `body` off the event; everything else it needs comes through the mocked
 * `getParam`. Narrowing to those fields keeps the fixture honest rather than faking a whole gateway
 * event that nothing looks at.
 */
const apiEvent = (body: unknown): APIGatewayProxyEvent => {
  const partial: Pick<APIGatewayProxyEvent, 'body' | 'headers'> = { body: JSON.stringify(body), headers: {} }

  // Safe: the handler and every mocked collaborator touch only these two fields.
  return partial as APIGatewayProxyEvent
}

const nowtEvent: Pick<JsonConfirmedEvent, 'eventType' | 'organizer' | 'stations' | 'classes'> = {
  classes: [],
  eventType: 'NOWT',
  organizer: { id: 'org-1', name: 'Org' },
  stations: [
    { date: '2026-09-12', id: 'post-1', number: 1 },
    { date: '2026-09-12', id: 'post-2', number: 2 },
    { date: '2026-09-12', id: 'post-3', number: 3 },
    { date: '2026-09-12', id: 'post-4', number: 4 },
  ],
}

/** A dog that ran: only a participant group has a round to record against it, the posts of its day. */
const registration = (id: string, eventClass: JsonRegistration['class'] = 'AVO', number = 1) =>
  asJsonRegistration({
    class: eventClass,
    eventId: 'event-1',
    group: { date: '2026-09-12', key: 'AVO-AP', number },
    id,
  })

const scores = (...points: number[]) => points.map((value, index) => ({ exercise: index + 1, part: 0, points: value }))

describe('putEventResultsLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetParam.mockReturnValue('event-1')
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org-1'], user: { id: 'u1', name: 'Sihteeri' } })
    mockGetAuthorizedEvent.mockResolvedValue(nowtEvent)
    mockGetEvent.mockResolvedValue(nowtEvent)
    storeRows([registration('reg-1'), registration('reg-2')])
    mockQueryAdminConnections.mockResolvedValue([])
    mockPublishRegistrationPatches.mockImplementation(actualActions.publishRegistrationPatches)
    mockPublishPublicStartList.mockImplementation(actualActions.publishPublicStartList)
  })

  it('answers with the saved results when the live pushes after the write fail (KOE-1583)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockQueryAdminConnections.mockRejectedValue(new Error('scan failed'))

    await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

    expect(mockWrittenResult).toHaveBeenCalledWith('event-1', 'reg-1', expect.anything())
    expect(mockResponse).toHaveBeenCalledWith(200, expect.anything(), expect.anything())
    expect(loggedLines(errorSpy)).toEqual([
      expect.objectContaining({ message: 'live push failed', publication: 'registration patches' }),
      expect.objectContaining({ message: 'live push failed', publication: 'public start list' }),
    ])
  })

  // What the save left stored for the dog, as the table holds it.
  const savedResult = (id = 'reg-1') => registrations.resultOf(id)

  it('derives the totals and the result from the submitted scores', async () => {
    await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

    // As last written, or a second save right after the first reads as someone else's (KOE-1490).
    expect(mockReadEventRegistrations).toHaveBeenCalledWith('event-1', true)
    expect(mockWrittenResult).toHaveBeenCalledTimes(1)
    expect(mockWrittenResult).toHaveBeenCalledWith('event-1', 'reg-1', expect.anything())
    expect(savedResult()).toMatchObject({
      maxPoints: 80,
      percentage: 81.25,
      points: 65,
      result: 'AVO1',
      updatedBy: 'Sihteeri',
    })
  })

  it('recomputes a total the client tried to supply', async () => {
    await putEventResultsLambda(
      apiEvent([{ eventResult: { points: 80, result: 'AVO1', tasks: scores(10, 10, 10, 10) }, id: 'reg-1' }])
    )

    // Believing the client here would publish a first prize for a round that earned a third.
    expect(savedResult()).toMatchObject({ points: 40, result: 'AVO3' })
  })

  it("scores a dog against its rotation group's own split of a post (KOE-1665)", async () => {
    mockGetAuthorizedEvent.mockResolvedValue({
      ...nowtEvent,
      rotations: [{ class: 'ALO', exercises: [{ parts: 2, stationId: 'post-1' }] }],
    })
    storeRows([registration('reg-1', 'ALO')])

    await putEventResultsLambda(
      apiEvent([
        {
          eventResult: {
            tasks: [
              { exercise: 1, part: 0, points: 9 },
              { exercise: 1, part: 1, points: 8 },
            ],
          },
          id: 'reg-1',
        },
      ])
    )

    expect(savedResult()).toMatchObject({ maxPoints: 20, points: 17 })
  })

  it("scores two exercises at a post at 20 each, and refuses an exercise outside the dog's group (KOE-1665)", async () => {
    mockGetAuthorizedEvent.mockResolvedValue({
      ...nowtEvent,
      rotations: [
        {
          class: 'AVO',
          exercises: [{ stationId: 'post-2' }, { stationId: 'post-1' }, { stationId: 'post-1' }],
          firstNumber: 1,
          lastNumber: 8,
        },
        {
          class: 'AVO',
          exercises: [{ stationId: 'post-1' }, { stationId: 'post-2' }, { stationId: 'post-2' }],
          firstNumber: 9,
          lastNumber: 16,
        },
      ],
    })
    storeRows([registration('reg-1', 'AVO', 3), registration('reg-2', 'AVO', 12)])

    await putEventResultsLambda(
      apiEvent([
        {
          eventResult: {
            tasks: [
              { exercise: 1, points: 18 },
              { exercise: 2, points: 17 },
              { exercise: 3, points: 16 },
            ],
          },
          id: 'reg-1',
        },
      ])
    )
    expect(savedResult()).toMatchObject({ maxPoints: 60, points: 51, result: 'AVO1' })

    await expect(
      putEventResultsLambda(apiEvent([{ eventResult: { tasks: [{ exercise: 4, points: 10 }] }, id: 'reg-2' }]))
    ).rejects.toThrow('Task exercise 4#0 is not part of the round')
  })

  it('publishes the start list only after every result is written (KOE-1516)', async () => {
    // The published list's version is the time it was read, so it has to be read after the writes.
    const steps: string[] = []
    mockWrittenResult.mockImplementation(async (_eventId: string, id: string) => {
      await Promise.resolve()
      steps.push(`write ${id}`)
    })
    mockPublishPublicStartList.mockImplementation(async () => {
      steps.push('publish start list')
    })

    await putEventResultsLambda(
      apiEvent([
        { eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' },
        { eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-2' },
      ])
    )

    expect(steps).toEqual(['write reg-1', 'write reg-2', 'publish start list'])
  })

  it('broadcasts the batch once rather than dog by dog', async () => {
    await putEventResultsLambda(
      apiEvent([
        { eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' },
        { eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-2' },
      ])
    )

    expect(mockWrittenResult).toHaveBeenCalledTimes(2)
    expect(mockPublishRegistrationPatches).toHaveBeenCalledTimes(1)
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event-1',
      [
        { eventResult: expect.objectContaining({ result: 'AVO1' }), id: 'reg-1' },
        { eventResult: expect.objectContaining({ result: 'AVO3' }), id: 'reg-2' },
      ],
      'org-1'
    )
    // A published result shows on the public row too, so the readers of the list get it (KOE-1358).
    expect(mockPublishPublicStartList).toHaveBeenCalledTimes(1)
    expect(mockPublishPublicStartList).toHaveBeenCalledWith('event-1')
  })

  it('audits each dog whose result was recorded', async () => {
    await putEventResultsLambda(
      apiEvent([
        { eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' },
        { eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-2' },
      ])
    )

    expect(mockAudit).toHaveBeenCalledTimes(2)
    // The sentence is translated, the result's own text rides along as a part (KOE-1442).
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event-1:reg-1',
      messageKey: 'audit.messages.resultSavedDetail',
      messageParams: { result: 'AVO1, 65/80 p' },
      user: 'Sihteeri',
    })
  })

  it('audits a changed result as a change', async () => {
    storeRows([
      { ...registration('reg-1'), eventResult: { points: 40, result: 'AVO3', tasks: scores(10, 10, 10, 10) } },
    ])

    await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event-1:reg-1',
      messageKey: 'audit.messages.resultChangedDetail',
      messageParams: { result: 'AVO1, 65/80 p' },
      user: 'Sihteeri',
    })
  })

  it('stores and audits an ill dog as a dash with what it earned, naming the cause (KOE-1669)', async () => {
    const retirement = { cause: 'illness' as const }
    await putEventResultsLambda(apiEvent([{ eventResult: { retirement, tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

    expect(mockWrittenResult).toHaveBeenCalledWith(
      'event-1',
      'reg-1',
      expect.objectContaining({ maxPoints: 80, points: 65, result: 'AVO-', retirement })
    )
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event-1:reg-1',
      messageKey: 'audit.messages.resultSavedDetail',
      messageParams: { result: 'AVO-, 65/80 p, koira sairastui' },
      user: 'Sihteeri',
    })
  })

  it('rejects an empty submission without touching anything', async () => {
    await putEventResultsLambda(apiEvent([]))

    expect(mockResponse).toHaveBeenCalledWith(422, 'no results', expect.anything())
    // The event itself is read first — parsing validates against its round — but nothing is written.
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    expect(mockWrittenResult).not.toHaveBeenCalled()
  })

  it('strips fields the result schema does not know rather than storing them', async () => {
    await putEventResultsLambda(
      apiEvent([
        {
          eventResult: { cert: 'totta kai', junk: 'x', ownerNotes: { nested: true }, tasks: scores(17, 18, 16, 14) },
          id: 'reg-1',
        },
      ])
    )

    // The stored item must not be writable by whatever a request chooses to put in it: this write
    // path is shared with the widely shared tokenized station link (KOE-1258).
    expect(savedResult()).not.toHaveProperty('junk')
    expect(savedResult()).not.toHaveProperty('ownerNotes')
    // A cert claim that is not a boolean is noise, not a certificate.
    expect(savedResult()).not.toHaveProperty('cert')
    expect(savedResult()).toMatchObject({ points: 65, result: 'AVO1' })
  })

  it('refuses points beyond what the task can hold', async () => {
    // The totals are recomputed, but a recomputation happily sums 30 on a 20-point task into an
    // unearned prize — the range is the server's to enforce.
    await expect(
      putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(30, 10, 10, 10) }, id: 'reg-1' }]))
    ).rejects.toThrow('out of range')

    expect(mockWrittenResult).not.toHaveBeenCalled()
  })

  it.each([0, 1.5, '3'])('refuses a retirement exercise of %j', async (exercise) => {
    await expect(
      putEventResultsLambda(
        apiEvent([{ eventResult: { retirement: { cause: 'injury', exercise }, tasks: [] }, id: 'reg-1' }])
      )
    ).rejects.toThrow('Malformed retirement exercise')
  })

  it('stores the exercise a round ended at (KOE-1665)', async () => {
    const retirement = { cause: 'injury' as const, exercise: 3 }
    await putEventResultsLambda(apiEvent([{ eventResult: { retirement, tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

    expect(mockWrittenResult).toHaveBeenCalledWith('event-1', 'reg-1', expect.objectContaining({ retirement }))
  })

  describe('where a round ended, by the way the type is scored (KOE-1665)', () => {
    it('keeps only the exercise of a round scored by exercise, whatever post a page sent beside it', async () => {
      await putEventResultsLambda(
        apiEvent([
          {
            eventResult: { retirement: { cause: 'injury', exercise: 3, stationId: 'post-1' }, tasks: [] },
            id: 'reg-1',
          },
        ])
      )
      await putEventResultsLambda(
        apiEvent([
          {
            eventResult: { elimination: { exercise: 2, fault: 'hardMouth', stationId: 'post-1' }, tasks: [] },
            id: 'reg-2',
          },
        ])
      )

      expect(mockWrittenResult).toHaveBeenNthCalledWith(
        1,
        'event-1',
        'reg-1',
        expect.objectContaining({ retirement: { cause: 'injury', exercise: 3 } })
      )
      expect(mockWrittenResult).toHaveBeenNthCalledWith(
        2,
        'event-1',
        'reg-2',
        expect.objectContaining({ elimination: { exercise: 2, fault: 'hardMouth' } })
      )
    })

    it('keeps only the post of a type judged as a whole at its posts', async () => {
      mockGetAuthorizedEvent.mockResolvedValue({ ...nowtEvent, eventType: 'NOME-B' })
      await putEventResultsLambda(
        apiEvent([
          {
            eventResult: { resultCode: '0', retirement: { cause: 'judgeStopped', exercise: 3, stationId: 'post-1' } },
            id: 'reg-1',
          },
        ])
      )
      await putEventResultsLambda(
        apiEvent([
          {
            eventResult: { elimination: { exercise: 2, fault: 'aggression', stationId: 'post-2' }, resultCode: '-' },
            id: 'reg-2',
          },
        ])
      )

      expect(mockWrittenResult).toHaveBeenNthCalledWith(
        1,
        'event-1',
        'reg-1',
        expect.objectContaining({ retirement: { cause: 'judgeStopped', stationId: 'post-1' } })
      )
      expect(mockWrittenResult).toHaveBeenNthCalledWith(
        2,
        'event-1',
        'reg-2',
        expect.objectContaining({ elimination: { fault: 'aggression', stationId: 'post-2' } })
      )
    })
  })

  it('caps a recalled task at its halved ceiling', async () => {
    await expect(
      putEventResultsLambda(
        apiEvent([
          {
            eventResult: { tasks: [{ exercise: 1, points: 11, recalled: true }] },
            id: 'reg-1',
          },
        ])
      )
    ).rejects.toThrow('out of range')
  })

  it('refuses a task naming a slot outside the round', async () => {
    await expect(
      putEventResultsLambda(apiEvent([{ eventResult: { tasks: [{ exercise: 9, points: 10 }] }, id: 'reg-1' }]))
    ).rejects.toThrow('not part of the round')
  })

  it.each([
    ['leaves the reason out', { exercise: 1, points: 0 }],
    ['sends an empty reason', { exercise: 1, points: 0, zeroFault: null }],
  ])('stores a zero when the browser %s, since the reason is optional (KOE-1709)', async (_, task) => {
    await putEventResultsLambda(apiEvent([{ eventResult: { tasks: [task] }, id: 'reg-1' }]))

    expect(savedResult().tasks).toEqual([expect.objectContaining({ exercise: 1, points: 0 })])
    expect(savedResult().tasks[0]).not.toHaveProperty('zeroFault')
  })

  // 'unknown' was a code until KOE-1709: a zero whose reason is not known now has none.
  it.each(['guess', 'unknown'])('refuses the zero fault %s, which the list does not hold', async (zeroFault) => {
    const request = putEventResultsLambda(
      apiEvent([{ eventResult: { tasks: [{ exercise: 1, points: 0, zeroFault }] }, id: 'reg-1' }])
    )

    await expect(request).rejects.toMatchObject({ statusCode: 422 })
    await expect(request).rejects.toThrow(`Unknown zero fault '${zeroFault}'`)

    expect(mockWrittenResult).not.toHaveBeenCalled()
  })

  it.each(['failedRetrieve', 'physicalContact'])('stores the §5.3.4 zero fault %s (KOE-1678)', async (zeroFault) => {
    await putEventResultsLambda(
      apiEvent([{ eventResult: { tasks: [{ exercise: 1, points: 0, zeroFault }] }, id: 'reg-1' }])
    )

    expect(mockWrittenResult).toHaveBeenCalledWith(
      'event-1',
      'reg-1',
      expect.objectContaining({ tasks: [expect.objectContaining({ points: 0, zeroFault })] })
    )
  })

  it.each(['abandonedRetrieve', 'dummyNotFound'])(
    'refuses %s, which §5.3.4 calls noudon epäonnistuminen (KOE-1678)',
    async (zeroFault) => {
      await expect(
        putEventResultsLambda(
          apiEvent([{ eventResult: { tasks: [{ exercise: 1, points: 0, zeroFault }] }, id: 'reg-1' }])
        )
      ).rejects.toThrow(`Unknown zero fault '${zeroFault}'`)

      expect(mockWrittenResult).not.toHaveBeenCalled()
    }
  )

  it('refuses a result code where the result is derived from the scores (§5.4.1, KOE-1678)', async () => {
    await expect(
      putEventResultsLambda(
        apiEvent([{ eventResult: { resultCode: '2', tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }])
      )
    ).rejects.toThrow("Result code '2' is not taken for NOWT: its result is derived from the scores")

    expect(mockWrittenResult).not.toHaveBeenCalled()
  })

  it('caps how many dogs one request may carry', async () => {
    const batch = Array.from({ length: 201 }, (_ignored, index) => ({
      eventResult: { tasks: scores(1, 1, 1, 1) },
      id: `reg-${index}`,
    }))

    await expect(putEventResultsLambda(apiEvent(batch))).rejects.toThrow('Too many submissions')
    expect(mockWrittenResult).not.toHaveBeenCalled()
  })

  describe('a task list larger than the round (KOE-1616)', () => {
    it('refuses the same exercise and part twice, and writes and audits nothing', async () => {
      const request = putEventResultsLambda(
        apiEvent([
          {
            eventResult: { tasks: [...scores(17, 18, 16, 14), { exercise: 2, part: 0, points: 5 }] },
            id: 'reg-1',
          },
        ])
      )

      await expect(request).rejects.toMatchObject({ statusCode: 422 })
      await expect(request).rejects.toThrow('Task exercise 2#0 is sent twice')
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('refuses the whole round sent many times over, which only repeats can make', async () => {
      const tasks = Array.from({ length: 50 }, () => scores(17, 18, 16, 14)).flat()

      await expect(putEventResultsLambda(apiEvent([{ eventResult: { tasks }, id: 'reg-1' }]))).rejects.toMatchObject({
        statusCode: 422,
      })
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('refuses a task for a type judged as a whole, which has none', async () => {
      mockGetAuthorizedEvent.mockResolvedValue({ ...nowtEvent, eventType: 'NOME-B', stations: undefined })
      mockReadEventRegistrations.mockResolvedValue([registration('reg-1', 'ALO')])

      const request = putEventResultsLambda(
        apiEvent([{ eventResult: { resultCode: '1', tasks: [{ exercise: 1, points: 10 }] }, id: 'reg-1' }])
      )

      await expect(request).rejects.toMatchObject({ statusCode: 422 })
      await expect(request).rejects.toThrow('Tasks are not taken for NOME-B')
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('refuses the same dog twice in one request, which would write and audit it twice', async () => {
      const request = putEventResultsLambda(
        apiEvent([
          { eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' },
          { eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-1' },
        ])
      )

      await expect(request).rejects.toMatchObject({ statusCode: 422 })
      await expect(request).rejects.toThrow("Registration 'reg-1' is sent twice")
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
      expect(mockAudit).not.toHaveBeenCalled()
    })
  })

  it('refuses a result for a dog that is not in the event', async () => {
    await expect(
      putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(20, 20, 20, 20) }, id: 'stranger' }]))
    ).rejects.toThrow("Registration 'stranger' not found")

    expect(mockWrittenResult).not.toHaveBeenCalled()
  })

  it.each([
    ['a reserve who was never called up', { group: { key: 'reserve', number: 1 } }],
    ['a dog that never got a place at all', { group: undefined }],
    ['an entry that was cancelled', { cancelled: true }],
  ])('refuses a result for %s', async (_case, state) => {
    storeRows([{ ...registration('reg-1'), ...state }])

    // The views never offer these a row, so a submission naming one is a client working from a list
    // that has moved on. Believing it would attribute a round to a dog that did not run it.
    await expect(
      putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(20, 20, 20, 20) }, id: 'reg-1' }]))
    ).rejects.toThrow("Registration 'reg-1' did not run")

    expect(mockWrittenResult).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('stops before writing when the caller has no access to the event', async () => {
    mockAuthorizeWithMemberOf.mockRejectedValue(httpError(401, 'Unauthorized'))

    await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(20, 20, 20, 20) }, id: 'reg-1' }]))

    expect(mockWrittenResult).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()
  })

  describe('retries and conflicts', () => {
    const stored = (updatedAt: string, points: number) => ({
      maxPoints: 80,
      percentage: (points * 100) / 80,
      points,
      result: points >= 64 ? 'AVO1' : 'AVO3',
      tasks: scores(points / 4, points / 4, points / 4, points / 4),
      updatedAt,
      updatedBy: 'Sihteeri',
    })

    it('treats a resubmission of an already stored result as nothing new', async () => {
      // The venue's connection drops, the secretary saves again, and the first attempt had landed.
      storeRows([{ ...registration('reg-1'), eventResult: stored('2026-09-12T10:00:00.000Z', 40) }])

      await putEventResultsLambda(
        apiEvent([{ basedOn: undefined, eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-1' }])
      )

      expect(mockWrittenResult).not.toHaveBeenCalled()
      expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()
      const [status, body] = mockResponse.mock.calls[0]
      expect(status).toBe(200)
      expect(body.saved).toEqual([])
      // The stored result comes back, so the client can carry on from the version that actually exists.
      expect(body.unchanged).toEqual([{ eventResult: expect.objectContaining({ points: 40 }), id: 'reg-1' }])
    })

    it('reports a conflict when someone else changed the result meanwhile', async () => {
      storeRows([{ ...registration('reg-1'), eventResult: stored('2026-09-12T11:00:00.000Z', 80) }])

      await putEventResultsLambda(
        apiEvent([
          // Based on a version that is no longer the stored one, and disagreeing with it.
          { basedOn: '2026-09-12T10:00:00.000Z', eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-1' },
        ])
      )

      expect(mockWrittenResult).not.toHaveBeenCalled()

      const [status, body] = mockResponse.mock.calls[0]
      expect(status).toBe(409)
      expect(body.error).toBe('resultConflict')
      expect(body.conflicts).toHaveLength(1)
      expect(body.conflicts[0]).toMatchObject({ id: 'reg-1' })
      // Both sides come back so a person can see what they are choosing between.
      expect(body.conflicts[0].stored.points).toBe(80)
      expect(body.conflicts[0].submitted.points).toBe(40)
    })

    it('saves the dogs that do not conflict rather than losing the screenful', async () => {
      storeRows([
        { ...registration('reg-1'), eventResult: stored('2026-09-12T11:00:00.000Z', 80) },
        registration('reg-2'),
      ])

      await putEventResultsLambda(
        apiEvent([
          { basedOn: '2026-09-12T10:00:00.000Z', eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-1' },
          { eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-2' },
        ])
      )

      expect(mockWrittenResult).toHaveBeenCalledTimes(1)
      expect(mockWrittenResult).toHaveBeenCalledWith('event-1', 'reg-2', expect.anything())

      const [, body] = mockResponse.mock.calls[0]
      expect(body.saved.map((item: { id: string }) => item.id)).toEqual(['reg-2'])
      expect(body.conflicts.map((c: { id: string }) => c.id)).toEqual(['reg-1'])
    })

    it('takes a stored reason away when the same zero comes back without one (KOE-1709)', async () => {
      const [first, ...rest] = scores(0, 10, 10, 10)
      storeRows([
        {
          ...registration('reg-1'),
          eventResult: {
            ...stored('2026-09-12T10:00:00.000Z', 30),
            tasks: [{ ...first, zeroFault: 'eyeWipe' }, ...rest],
          },
        },
      ])

      await putEventResultsLambda(
        apiEvent([{ basedOn: '2026-09-12T10:00:00.000Z', eventResult: { tasks: [first, ...rest] }, id: 'reg-1' }])
      )

      expect(savedResult().tasks[0]).toMatchObject({ exercise: 1, points: 0 })
      expect(savedResult().tasks[0]).not.toHaveProperty('zeroFault')
    })

    it('accepts an edit made against the version that is actually stored', async () => {
      storeRows([{ ...registration('reg-1'), eventResult: stored('2026-09-12T10:00:00.000Z', 40) }])

      await putEventResultsLambda(
        apiEvent([{ basedOn: '2026-09-12T10:00:00.000Z', eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }])
      )

      expect(mockWrittenResult).toHaveBeenCalledTimes(1)
      const [status, body] = mockResponse.mock.calls[0]
      expect(status).toBe(200)
      expect(body.saved).toEqual([{ eventResult: expect.objectContaining({ points: 65 }), id: 'reg-1' }])
    })
  })

  describe('a post that is the whole trial', () => {
    const judge = { id: 123, name: 'Tuomari' }
    const nomeB = { ...nowtEvent, eventType: 'NOME-B', stations: undefined }

    beforeEach(() => {
      mockGetAuthorizedEvent.mockResolvedValue(nomeB)
      storeRows([
        {
          ...registration('reg-1', 'ALO'),
          eventResult: { judge, result: 'ALO1', updatedAt: '2026-09-12T10:00:00.000Z', updatedBy: 'Sihteeri' },
        },
      ])
    })

    it('saves a corrected verdict from the post: there is no task slice to call unchanged', async () => {
      await putEventResultsLambda(
        apiEvent([
          {
            basedOn: '2026-09-12T10:00:00.000Z',
            eventResult: { judge, resultCode: '2', tasks: [] },
            id: 'reg-1',
            stationId: '1',
          },
        ])
      )

      const [status] = mockResponse.mock.calls[0]
      expect(status).toBe(200)
      expect(savedResult()).toMatchObject({ result: 'ALO2' })
    })

    it('treats the same verdict sent again as nothing new', async () => {
      await putEventResultsLambda(
        apiEvent([{ eventResult: { judge, resultCode: '1', tasks: [] }, id: 'reg-1', stationId: '1' }])
      )

      const [status, body] = mockResponse.mock.calls[0]
      expect(status).toBe(200)
      expect(body.unchanged.map((item: { id: string }) => item.id)).toEqual(['reg-1'])
      expect(mockWrittenResult).not.toHaveBeenCalled()
    })

    it("versions the post's save on the whole result, as the results page does", async () => {
      await putEventResultsLambda(
        apiEvent([
          { basedOn: 'stale', eventResult: { judge, resultCode: '2', tasks: [] }, id: 'reg-1', stationId: '1' },
        ])
      )

      const [status] = mockResponse.mock.calls[0]
      expect(status).toBe(409)
      expect(mockWrittenResult).not.toHaveBeenCalled()
    })
  })

  describe('parallel entry by post', () => {
    // Without a running order of its own the day's posts are done in number order: post n is exercise n.
    const scoredAt = (exercise: number, points: number, updatedAt: string, updatedBy: string) => ({
      exercise,
      part: 0,
      points,
      updatedAt,
      updatedBy,
    })

    const withStored = (...tasks: ReturnType<typeof scoredAt>[]) =>
      storeRows([
        {
          ...registration('reg-1'),
          eventResult: { tasks, updatedAt: '2026-09-12T10:00:00.000Z', updatedBy: 'Rasti 1' },
        },
      ])

    it("keeps another post's scores when one post saves its own", async () => {
      withStored(scoredAt(1, 17, '2026-09-12T10:00:00.000Z', 'Rasti 1'))

      await putEventResultsLambda(
        apiEvent([{ eventResult: { tasks: [{ exercise: 3, points: 18 }] }, id: 'reg-1', stationId: 'post-3' }])
      )

      const stored = savedResult()
      expect(stored.tasks).toEqual([
        expect.objectContaining({ exercise: 1, points: 17 }),
        expect.objectContaining({ exercise: 3, part: 0, points: 18 }),
      ])
      expect(stored.points).toBe(35)
    })

    // The link's rule is the link's (KOE-1615): the secretary's post view may change any outcome.
    it("lets the secretary's post view change an outcome stored at another post", async () => {
      storeRows([
        {
          ...registration('reg-1'),
          eventResult: {
            retirement: { cause: 'injury', exercise: 3 },
            tasks: [],
            updatedAt: '2026-09-12T10:00:00.000Z',
            updatedBy: 'Rasti 3',
          },
        },
      ])

      await putEventResultsLambda(
        apiEvent([
          {
            eventResult: { retirement: { cause: 'illness', exercise: 3 }, tasks: [{ exercise: 1, points: 17 }] },
            id: 'reg-1',
            stationId: 'post-1',
          },
        ])
      )

      expect(savedResult().retirement).toEqual({ cause: 'illness', exercise: 3 })
    })

    it('does not call two posts scoring the same dog a conflict', async () => {
      // Post 3 saved last, so the whole result is newer than anything post 1 ever saw. Versioning the
      // result rather than the post would reject post 1's first save as stale.
      withStored(scoredAt(3, 18, '2026-09-12T11:00:00.000Z', 'Rasti 3'))

      await putEventResultsLambda(
        apiEvent([{ eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1', stationId: 'post-1' }])
      )

      expect(mockWrittenResult).toHaveBeenCalledTimes(1)
      const [, body] = mockResponse.mock.calls[0]
      expect(body.saved.map((item: { id: string }) => item.id)).toEqual(['reg-1'])
      expect(body.conflicts).toEqual([])
    })

    it('reports a conflict only when the same post was rescored by someone else', async () => {
      withStored(scoredAt(1, 17, '2026-09-12T11:00:00.000Z', 'Joku muu'))

      await putEventResultsLambda(
        apiEvent([
          {
            basedOn: '2026-09-12T10:00:00.000Z',
            eventResult: { tasks: [{ exercise: 1, points: 12 }] },
            id: 'reg-1',
            stationId: 'post-1',
          },
        ])
      )

      expect(mockWrittenResult).not.toHaveBeenCalled()

      const [status, body] = mockResponse.mock.calls[0]
      expect(status).toBe(409)
      // The post is named, so only that post has to be re-entered.
      expect(body.conflicts[0]).toMatchObject({ id: 'reg-1', stationId: 'post-1' })
    })

    it('treats a post resending what it already stored as nothing new', async () => {
      withStored(scoredAt(1, 17, '2026-09-12T10:00:00.000Z', 'Rasti 1'))

      await putEventResultsLambda(
        apiEvent([{ eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1', stationId: 'post-1' }])
      )

      expect(mockWrittenResult).not.toHaveBeenCalled()
      const [, body] = mockResponse.mock.calls[0]
      expect(body.unchanged.map((item: { id: string }) => item.id)).toEqual(['reg-1'])
    })

    it('saves an elimination that arrives with the task list unchanged', async () => {
      // A dog can be thrown out before or after its post scored: the outcome is then the whole save,
      // and task equality alone must not make it read as a retry that changes nothing.
      withStored(scoredAt(1, 17, '2026-09-12T10:00:00.000Z', 'Rasti 1'))

      await putEventResultsLambda(
        apiEvent([
          {
            basedOn: '2026-09-12T10:00:00.000Z',
            eventResult: {
              elimination: { exercise: 1, fault: 'aggression' },
              tasks: [{ exercise: 1, points: 17 }],
            },
            id: 'reg-1',
            stationId: 'post-1',
          },
        ])
      )

      expect(mockWrittenResult).toHaveBeenCalledTimes(1)
      expect(savedResult()).toMatchObject({
        elimination: { exercise: 1, fault: 'aggression' },
        result: 'AVO0',
      })
    })

    it("refuses a post's save that carries another post's exercise, and writes nothing (KOE-1665)", async () => {
      withStored(scoredAt(2, 20, '2026-09-12T10:00:00.000Z', 'Rasti 2'))

      // A page opened before the running order changed would send an exercise the post no longer does: it
      // is told the layout changed rather than told it saved what was left out.
      await putEventResultsLambda(
        apiEvent([
          {
            eventResult: {
              tasks: [
                { exercise: 1, points: 17 },
                { exercise: 2, points: 1 },
              ],
            },
            id: 'reg-1',
            stationId: 'post-1',
          },
        ])
      )

      expect(mockResponse).toHaveBeenCalledWith(409, expect.objectContaining({ error: 'staleData' }), expect.anything())

      expect(mockWrittenResult).not.toHaveBeenCalled()
    })
  })

  describe('a score address the round cannot hold (KOE-1665)', () => {
    it.each([
      ['a negative part', { exercise: 1, part: -1 }],
      ['a part that is not a whole number', { exercise: 1, part: 0.5 }],
      ['exercise 0', { exercise: 0 }],
    ])('refuses %s', async (_name, address) => {
      await expect(
        putEventResultsLambda(apiEvent([{ eventResult: { tasks: [{ ...address, points: 10 }] }, id: 'reg-1' }]))
      ).rejects.toThrow('Malformed task')
    })
  })

  describe('one user entering a whole round, dog by dog', () => {
    // Without a running order of its own the day's posts are done in number order: post n is exercise n.
    const scoredAt = (exercise: number, points: number, updatedAt: string, updatedBy: string) => ({
      exercise,
      part: 0,
      points,
      updatedAt,
      updatedBy,
    })

    it('stores every post in one go', async () => {
      await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

      expect(savedResult().tasks).toHaveLength(4)
      expect(savedResult()).toMatchObject({ points: 65, result: 'AVO1' })
    })

    it('builds on what a post already recorded, when working from the current version', async () => {
      storeRows([
        {
          ...registration('reg-1'),
          eventResult: {
            tasks: [scoredAt(1, 17, '2026-09-12T10:00:00.000Z', 'Rasti 1')],
            updatedAt: '2026-09-12T10:00:00.000Z',
            updatedBy: 'Rasti 1',
          },
        },
      ])

      await putEventResultsLambda(
        apiEvent([{ basedOn: '2026-09-12T10:00:00.000Z', eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }])
      )

      expect(savedResult()).toMatchObject({ points: 65, result: 'AVO1' })
    })

    it('will not silently overwrite a post it never saw', async () => {
      // A stale page believing nothing was stored must not wipe the post someone entered meanwhile.
      storeRows([
        {
          ...registration('reg-1'),
          eventResult: {
            tasks: [scoredAt(1, 17, '2026-09-12T10:00:00.000Z', 'Rasti 1')],
            updatedAt: '2026-09-12T10:00:00.000Z',
            updatedBy: 'Rasti 1',
          },
        },
      ])

      await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(1, 1, 1, 1) }, id: 'reg-1' }]))

      expect(mockWrittenResult).not.toHaveBeenCalled()
      expect(mockResponse.mock.calls[0][0]).toBe(409)
    })

    it('mixes with per-post entry on the same dog', async () => {
      // Whole round first, then one post rescored on its own.
      await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

      const afterRound = savedResult()
      storeRows([{ ...registration('reg-1'), eventResult: afterRound }])
      mockWrittenResult.mockClear()

      await putEventResultsLambda(
        apiEvent([
          {
            basedOn: afterRound.tasks[2].updatedAt,
            eventResult: { tasks: [{ exercise: 3, points: 20 }] },
            id: 'reg-1',
            stationId: 'post-3',
          },
        ])
      )

      const afterPost = savedResult()
      expect(afterPost.tasks).toHaveLength(4)
      expect(afterPost.points).toBe(69)
    })
  })

  describe('scoring one dog at a time at the post', () => {
    it('lets the secretary correct a dog they just scored', async () => {
      await putEventResultsLambda(
        apiEvent([{ eventResult: { tasks: [{ exercise: 2, points: 17 }] }, id: 'reg-1', stationId: 'post-2' }])
      )

      // Everything the next save needs is in the response: without it the secretary conflicts with
      // their own work, and a venue with a bad connection cannot fall back on the WebSocket.
      const [, first] = mockResponse.mock.calls[0]
      const version = first.saved[0].eventResult.tasks.find(
        (task: { exercise: number }) => task.exercise === 2
      ).updatedAt

      storeRows([{ ...registration('reg-1'), eventResult: first.saved[0].eventResult }])
      mockWrittenResult.mockClear()
      mockResponse.mockClear()

      await putEventResultsLambda(
        apiEvent([
          {
            basedOn: version,
            eventResult: { tasks: [{ exercise: 2, points: 15 }] },
            id: 'reg-1',
            stationId: 'post-2',
          },
        ])
      )

      expect(mockResponse.mock.calls[0][0]).toBe(200)
      expect(savedResult().points).toBe(15)
    })

    it('records a pass or fail for an event type with no posts at all', async () => {
      mockGetAuthorizedEvent.mockResolvedValue({
        classes: [],
        eventType: 'NOU',
        organizer: { id: 'org-1', name: 'Org' },
      })
      storeRows([{ ...registration('reg-1'), class: undefined }])

      await putEventResultsLambda(apiEvent([{ eventResult: { resultCode: '1' }, id: 'reg-1' }]))

      expect(savedResult()).toMatchObject({ result: 'NOU1' })
    })

    it('stores a NOME-A result with its prefix and audits it as Kennelliitto lists it (KOE-1592)', async () => {
      mockGetAuthorizedEvent.mockResolvedValue({
        classes: [],
        eventType: 'NOME-A',
        organizer: { id: 'org-1', name: 'Org' },
      })
      storeRows([{ ...registration('reg-1'), class: undefined }])

      await putEventResultsLambda(apiEvent([{ eventResult: { resultCode: '1' }, id: 'reg-1' }]))

      expect(mockWrittenResult).toHaveBeenCalledWith('event-1', 'reg-1', expect.objectContaining({ result: 'NOME-A1' }))
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:reg-1',
        messageKey: 'audit.messages.resultSavedDetail',
        messageParams: { result: 'A1' },
        user: 'Sihteeri',
      })
    })

    it('refuses a code the event type cannot award', async () => {
      mockGetAuthorizedEvent.mockResolvedValue({
        classes: [],
        eventType: 'NOU',
        organizer: { id: 'org-1', name: 'Org' },
      })
      storeRows([{ ...registration('reg-1'), class: undefined }])

      // A pass/fail test has no prizes: a '2' can only be a client working from the wrong alphabet.
      await expect(
        putEventResultsLambda(apiEvent([{ eventResult: { resultCode: '2' }, id: 'reg-1' }]))
      ).rejects.toThrow("Result code '2' is not valid for NOU")

      expect(mockWrittenResult).not.toHaveBeenCalled()
    })

    // KOE-1718: an unofficial trial that follows NOU is judged pass or fail, and its result is spelled NOU1.
    describe('an unofficial trial that follows NOU', () => {
      beforeEach(() => {
        mockGetAuthorizedEvent.mockResolvedValue({
          classes: [],
          eventType: 'NOU-harjoitus',
          officialFormat: 'NOU',
          organizer: { id: 'org-1', name: 'Org' },
        })
        storeRows([{ ...registration('reg-1'), class: undefined, eventType: 'NOU-harjoitus' }])
      })

      it('stores the pass spelled by the type it follows', async () => {
        await putEventResultsLambda(apiEvent([{ eventResult: { resultCode: '1' }, id: 'reg-1' }]))

        expect(mockWrittenResult).toHaveBeenCalledWith('event-1', 'reg-1', expect.objectContaining({ result: 'NOU1' }))
      })

      it('refuses a prize the type it follows cannot award', async () => {
        await expect(
          putEventResultsLambda(apiEvent([{ eventResult: { resultCode: '2' }, id: 'reg-1' }]))
        ).rejects.toThrow("Result code '2' is not valid for NOU")

        expect(mockWrittenResult).not.toHaveBeenCalled()
      })
    })
  })

  it('keeps the exercise an elimination happened at (KOE-1665)', async () => {
    const elimination = { exercise: 2, fault: 'hardMouth' as const }
    await putEventResultsLambda(
      apiEvent([{ eventResult: { elimination, tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1' }])
    )

    // Which post threw the dog out is worth knowing, and it is lost the moment only the fault is kept. A
    // round that ended early keeps what a post had already scored, as every ended round does (KOE-1669).
    expect(mockWrittenResult).toHaveBeenCalledWith(
      'event-1',
      'reg-1',
      expect.objectContaining({ elimination, points: 17, result: 'AVO0' })
    )
  })

  it.each([0, 1.5, '3'])('refuses an elimination exercise of %j', async (exercise) => {
    await expect(
      putEventResultsLambda(
        apiEvent([{ eventResult: { elimination: { exercise, fault: 'hardMouth' }, tasks: [] }, id: 'reg-1' }])
      )
    ).rejects.toThrow('Malformed elimination exercise')
  })
  describe('a trial handed to the chief judge', () => {
    const handedOver = { ...nowtEvent, kcState: { code: 1253, name: 'Ylituomarin hyväksyttäväksi', readAt: 'x' } }
    const stored = {
      maxPoints: 80,
      percentage: 50,
      points: 40,
      result: 'AVO3',
      tasks: scores(10, 10, 10, 10),
      updatedAt: '2026-09-12T10:00:00.000Z',
      updatedBy: 'Sihteeri',
    }

    it('refuses a new result, as locked, and writes nothing', async () => {
      mockGetEvent.mockResolvedValue(handedOver)

      await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

      expect(mockResponse).toHaveBeenCalledWith(
        423,
        expect.objectContaining({ error: 'resultsLocked' }),
        expect.anything()
      )
      expect(mockWrittenResult).not.toHaveBeenCalled()
    })

    it('refuses a disputed save too, as locked rather than as a conflict', async () => {
      mockGetEvent.mockResolvedValue(handedOver)
      storeRows([{ ...registration('reg-1'), eventResult: stored }])

      await putEventResultsLambda(
        apiEvent([{ basedOn: '2026-09-12T09:00:00.000Z', eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }])
      )

      expect(mockResponse).toHaveBeenCalledWith(
        423,
        expect.objectContaining({ error: 'resultsLocked' }),
        expect.anything()
      )
    })

    it('still answers a retry of a save that already landed', async () => {
      mockGetEvent.mockResolvedValue(handedOver)
      storeRows([{ ...registration('reg-1'), eventResult: stored }])

      await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-1' }]))

      expect(mockResponse).toHaveBeenCalledWith(200, expect.objectContaining({ saved: [] }), expect.anything())
    })

    it('stops a batch at the dog the hand-over took the lock before, and publishes the dogs saved until then', async () => {
      // The first dog is saved while the trial is open; the hand-over takes the lock before the second.
      mockGetEvent.mockResolvedValueOnce(nowtEvent).mockResolvedValue(handedOver)

      await putEventResultsLambda(
        apiEvent([
          { eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' },
          { eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-2' },
        ])
      )

      expect(mockWrittenResult).toHaveBeenCalledTimes(1)
      expect(mockWrittenResult).toHaveBeenCalledWith('event-1', 'reg-1', expect.anything())
      expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
        'event-1',
        [expect.objectContaining({ id: 'reg-1' })],
        'org-1'
      )
      expect(mockResponse).toHaveBeenCalledWith(
        423,
        expect.objectContaining({ error: 'resultsLocked', saved: [expect.objectContaining({ id: 'reg-1' })] }),
        expect.anything()
      )
    })

    it('asks the row for the lock before every dog it writes, not once for the batch', async () => {
      await putEventResultsLambda(
        apiEvent([
          { eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' },
          { eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'reg-2' },
        ])
      )

      expect(mockGetEvent).toHaveBeenCalledTimes(2)
    })

    it('refuses nothing of a batch when one of its submissions is refused outright', async () => {
      await expect(
        putEventResultsLambda(
          apiEvent([
            { eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' },
            { eventResult: { tasks: scores(10, 10, 10, 10) }, id: 'stranger' },
          ])
        )
      ).rejects.toThrow("Registration 'stranger' not found")

      expect(mockWrittenResult).not.toHaveBeenCalled()
    })

    it('refuses a finished trial the same way', async () => {
      mockGetEvent.mockResolvedValue({ ...nowtEvent, kcState: { code: 304, name: 'Valmistunut', readAt: 'x' } })

      await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

      expect(mockResponse).toHaveBeenCalledWith(
        423,
        expect.objectContaining({ error: 'resultsLocked' }),
        expect.anything()
      )
    })

    it('saves again once the judge has sent the trial back', async () => {
      mockGetEvent.mockResolvedValue({ ...nowtEvent, kcState: { code: 754, name: 'Hyväksytty', readAt: 'x' } })

      await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

      expect(mockWrittenResult).toHaveBeenCalledTimes(1)
    })

    it('reads the lock as last written', async () => {
      await putEventResultsLambda(apiEvent([{ eventResult: { tasks: scores(17, 18, 16, 14) }, id: 'reg-1' }]))

      expect(mockGetEvent).toHaveBeenCalledWith('event-1', true)
    })
  })

  describe('what a save stamps (KOE-1703)', () => {
    const first = '2026-09-12T10:00:00.000Z'
    const second = '2026-09-12T10:05:00.000Z'
    const scoredAt = (exercise: number, points: number | null, updatedAt: string, updatedBy: string) => ({
      exercise,
      part: 0,
      points,
      updatedAt,
      updatedBy,
    })
    /** Without a running order of its own the day's posts are done in number order: post n is exercise n. */
    const twoPosts = () => [scoredAt(1, 15, first, 'Suorituspaikka 1'), scoredAt(2, 12, second, 'Suorituspaikka 2')]
    const unstamped = (...tasks: { exercise: number; part: number; points: number | null }[]) =>
      tasks.map(({ exercise, part, points }) => ({ exercise, part, points }))
    const storedWith = (eventResult: object, number = 1) => {
      mockWrittenResult.mockClear()
      mockResponse.mockClear()
      storeRows([
        {
          ...registration('reg-1', 'AVO', number),
          eventResult: { updatedAt: second, updatedBy: 'Sihteeri', ...eventResult },
        },
      ])
    }
    const save = (submission: object) => putEventResultsLambda(apiEvent([{ id: 'reg-1', ...submission }]))
    const expectConflict = () => {
      expect(mockWrittenResult).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(
        409,
        expect.objectContaining({ error: 'resultConflict' }),
        expect.anything()
      )
    }
    const correctedSecond = {
      basedOn: second,
      eventResult: { tasks: unstamped(twoPosts()[0], { exercise: 2, part: 0, points: 14 }) },
    }
    /** A dog of this number does exercise 1 at post 2, and exercises 2 and 3 at post 1. */
    const postDoingTwo = {
      ...nowtEvent,
      rotations: [
        {
          class: 'AVO',
          exercises: [{ stationId: 'post-2' }, { stationId: 'post-1' }, { stationId: 'post-1' }],
          firstNumber: 1,
          lastNumber: 8,
        },
      ],
    }

    it('keeps the stamp and the writer on a task a whole-round save does not change', async () => {
      storedWith({ tasks: twoPosts() })

      await save(correctedSecond)

      const [kept, changed] = savedResult().tasks
      expect(kept).toMatchObject({ exercise: 1, points: 15, updatedAt: first, updatedBy: 'Suorituspaikka 1' })
      expect(changed).toMatchObject({ exercise: 2, points: 14, updatedBy: 'Sihteeri' })
      expect(changed.updatedAt).not.toBe(second)
      expect(savedResult().updatedAt).not.toBe(second)
    })

    it('leaves the next save of a post whose score nobody changed without a conflict', async () => {
      storedWith({ tasks: twoPosts() })
      await save(correctedSecond)
      storedWith(savedResult())

      await save({
        basedOn: first,
        eventResult: { tasks: [{ exercise: 1, part: 0, points: 18 }] },
        stationId: 'post-1',
      })

      expect(mockWrittenResult).toHaveBeenCalledTimes(1)
      expect(savedResult().tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ exercise: 1, points: 18 }),
          expect.objectContaining({ exercise: 2, points: 14 }),
        ])
      )
    })

    it("keeps a post's correction, its stamp and its writer through a save that carries it along untouched", async () => {
      const correctedAt = '2026-09-12T10:10:00.000Z'
      const tasks = [scoredAt(1, 18, correctedAt, 'Suorituspaikka 1'), scoredAt(2, 12, second, 'Suorituspaikka 2')]
      storedWith({ tasks, updatedAt: correctedAt })

      // What the results page sends once it has rebased the secretary's edit on the post's correction.
      await save({
        basedOn: correctedAt,
        eventResult: { tasks: unstamped(tasks[0], { exercise: 2, part: 0, points: 14 }) },
      })

      expect(savedResult().tasks[0]).toMatchObject({
        exercise: 1,
        points: 18,
        updatedAt: correctedAt,
        updatedBy: 'Suorituspaikka 1',
      })
      storedWith(savedResult())

      await save({
        basedOn: correctedAt,
        eventResult: { tasks: [{ exercise: 1, part: 0, points: 19 }] },
        stationId: 'post-1',
      })

      expect(mockWrittenResult).toHaveBeenCalledTimes(1)
    })

    it('still gives a post a conflict when a whole-round save did change its score', async () => {
      storedWith({ tasks: twoPosts() })
      await save(correctedSecond)
      storedWith(savedResult())

      await save({
        basedOn: second,
        eventResult: { tasks: [{ exercise: 2, part: 0, points: 9 }] },
        stationId: 'post-2',
      })

      expectConflict()
    })

    it('stamps a score a whole-round save cleared, and keeps the stamp of a blank that stays blank', async () => {
      const blank = scoredAt(3, null, first, 'Suorituspaikka 3')
      storedWith({ tasks: [...twoPosts(), blank] })

      await save({
        basedOn: second,
        eventResult: { tasks: unstamped({ ...twoPosts()[0], points: null }, twoPosts()[1], blank) },
      })

      const [cleared, kept, stillBlank] = savedResult().tasks
      expect(cleared).toMatchObject({ exercise: 1, points: null, updatedBy: 'Sihteeri' })
      expect(kept).toMatchObject({ exercise: 2, updatedAt: second, updatedBy: 'Suorituspaikka 2' })
      expect(stillBlank).toMatchObject({ exercise: 3, updatedAt: first, updatedBy: 'Suorituspaikka 3' })
    })

    it('stores no blank a whole-round save brings to an address with nothing stored, so that post holds no version', async () => {
      storedWith({ tasks: twoPosts() })

      await save({
        basedOn: second,
        eventResult: {
          tasks: unstamped(twoPosts()[0], { exercise: 2, part: 0, points: 14 }, { exercise: 3, part: 0, points: null }),
        },
      })

      expect(savedResult().tasks.map((task: { exercise: number }) => task.exercise)).toEqual([1, 2])
    })

    describe('an outcome, which a stale post page must not undo unasked', () => {
      const staleAtPost2 = {
        basedOn: second,
        eventResult: { tasks: [{ exercise: 2, part: 0, points: 12 }] },
        stationId: 'post-2',
      }

      it.each([
        ['recorded an outcome at the exercise of the post', {}, { retirement: { cause: 'injury', exercise: 2 } }],
        ['cleared the outcome at the exercise of the post', { retirement: { cause: 'injury', exercise: 2 } }, {}],
        [
          'changed the outcome at the exercise of the post',
          { retirement: { cause: 'injury', exercise: 2 } },
          { retirement: { cause: 'illness', exercise: 2 } },
        ],
        [
          'moved the outcome away from the post',
          { retirement: { cause: 'injury', exercise: 2 } },
          { retirement: { cause: 'injury', exercise: 1 } },
        ],
        [
          'moved the outcome to the post',
          { retirement: { cause: 'injury', exercise: 1 } },
          { retirement: { cause: 'injury', exercise: 2 } },
        ],
      ])('gives the post a conflict when a whole-round save has %s', async (_name, before, after) => {
        storedWith({ tasks: twoPosts(), ...before })
        await save({ basedOn: second, eventResult: { tasks: unstamped(...twoPosts()), ...after } })
        storedWith(savedResult())

        // The page echoes the outcome it read.
        await save({ ...staleAtPost2, eventResult: { ...staleAtPost2.eventResult, ...before } })

        expectConflict()
      })

      it('leaves the stamps of a post the outcome does not name', async () => {
        storedWith({ tasks: twoPosts() })

        await save({
          basedOn: second,
          eventResult: { retirement: { cause: 'injury', exercise: 2 }, tasks: unstamped(...twoPosts()) },
        })

        expect(savedResult().tasks[0]).toMatchObject({ exercise: 1, updatedAt: first, updatedBy: 'Suorituspaikka 1' })
      })

      it('moves no stamp for an outcome without a place, which no post can undo', async () => {
        storedWith({ tasks: twoPosts() })

        await save({
          basedOn: second,
          eventResult: { retirement: { cause: 'injury' }, tasks: unstamped(...twoPosts()) },
        })

        expect(savedResult().tasks).toEqual(twoPosts())
      })

      it('moves the version of a post doing two exercises when the outcome names the one without a score', async () => {
        mockGetAuthorizedEvent.mockResolvedValue(postDoingTwo)
        const tasks = [scoredAt(3, 15, first, 'Suorituspaikka 1')]
        storedWith({ tasks }, 3)
        await save({
          basedOn: second,
          eventResult: { retirement: { cause: 'injury', exercise: 2 }, tasks: unstamped(...tasks) },
        })
        storedWith(savedResult(), 3)

        await save({
          basedOn: first,
          eventResult: { tasks: [{ exercise: 3, part: 0, points: 18 }] },
          stationId: 'post-1',
        })

        expectConflict()
      })

      it("moves the version of the post named when the secretary's view of another post clears the outcome", async () => {
        storedWith({ retirement: { cause: 'injury', exercise: 1 }, tasks: twoPosts() })
        await save({
          basedOn: second,
          eventResult: { tasks: [{ exercise: 2, part: 0, points: 12 }] },
          stationId: 'post-2',
        })
        storedWith(savedResult())

        await save({
          basedOn: first,
          eventResult: { retirement: { cause: 'injury', exercise: 1 }, tasks: [{ exercise: 1, part: 0, points: 15 }] },
          stationId: 'post-1',
        })

        expectConflict()
      })
    })

    describe("a post's own save", () => {
      const twoExercises = () => [scoredAt(2, 15, first, 'Sihteeri'), scoredAt(3, 12, second, 'Suorituspaikka 1')]

      beforeEach(() => mockGetAuthorizedEvent.mockResolvedValue(postDoingTwo))

      it('keeps the writer of the exercise it did not change, and moves the version by the one it did', async () => {
        storedWith({ tasks: twoExercises() }, 3)

        await save({
          basedOn: second,
          eventResult: { tasks: unstamped(twoExercises()[0], { exercise: 3, part: 0, points: 14 }) },
          stationId: 'post-1',
        })

        const [kept, changed] = savedResult().tasks
        expect(kept).toMatchObject({ exercise: 2, updatedAt: first, updatedBy: 'Sihteeri' })
        expect(changed).toMatchObject({ exercise: 3, points: 14, updatedBy: 'Sihteeri' })
        expect(changed.updatedAt).not.toBe(second)
      })

      it('moves its own version with an outcome saved alone, so a second page at the post is asked', async () => {
        storedWith({ tasks: twoExercises() }, 3)
        await save({
          basedOn: second,
          eventResult: { retirement: { cause: 'injury', exercise: 3 }, tasks: unstamped(...twoExercises()) },
          stationId: 'post-1',
        })
        storedWith(savedResult(), 3)

        await save({ basedOn: second, eventResult: { tasks: unstamped(...twoExercises()) }, stationId: 'post-1' })

        expectConflict()
      })
    })
  })
})
