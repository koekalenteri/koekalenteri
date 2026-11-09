import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { EventStation } from '../../types'
import { vi } from 'vitest'
import { asJsonConfirmedEvent, asJsonRegistration, deletedEvent, eventNotFound } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'
import { registrationStore } from '../test-utils/registrationStore'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockGetParam = vi.fn()
const mockAudit = vi.fn()
const mockRegistrationAuditKey = vi.fn()
const mockGetEvent = vi.fn()
const mockGetLiveEvent = vi.fn()
const registrations = registrationStore()
const storeRows = registrations.store
const mockReadEventRegistrations = vi.fn(registrations.readEventRegistrations)
const mockReadRegistration = vi.fn(registrations.readRegistration)
const mockWriteEventResult = vi.fn(registrations.writeEventResult)
const mockWrittenResult = registrations.written
const mockPublishRegistrationPatches = vi.fn()

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

vi.doMock('../lib/audit', () => ({ audit: mockAudit, registrationAuditKey: mockRegistrationAuditKey }))
vi.doMock('../lib/event', () => ({ getEvent: mockGetEvent, getLiveEvent: mockGetLiveEvent }))
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
const mockPublishPublicStartList = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishPublicStartList: mockPublishPublicStartList,
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

const { default: putStationEntryLambda } = await import('./handler')
// Imported after the mocks: its own imports reach the publishers, which must load on the mocked scan.
const { getStationEntryToken } = await import('../lib/stationEntry')
const actualActions = await vi.importActual<typeof import('../lib/ws/actions')>('../lib/ws/actions')

const station: EventStation = { date: '2026-09-12', id: 'post-1', number: 1 }

const confirmedEvent = asJsonConfirmedEvent({
  classes: [],
  eventType: 'NOWT',
  id: 'event-1',
  organizer: { id: 'org-1', name: 'Org' },
  stations: [station, { date: '2026-09-12', id: 'post-2', number: 2 }],
})

const registration = (id: string) =>
  asJsonRegistration({
    class: 'AVO',
    eventId: 'event-1',
    group: { date: '2026-09-12', key: 'AVO-AP', number: 1 },
    id,
  })

const apiEvent = (body: unknown, token?: string): APIGatewayProxyEvent => {
  const bearer = token ?? getStationEntryToken('event-1', station)
  const partial: Pick<APIGatewayProxyEvent, 'body' | 'headers'> = {
    body: JSON.stringify(body),
    headers: { authorization: `Bearer ${bearer}` },
  }

  // Safe: the handler and every mocked collaborator touch only these two fields.
  return partial as APIGatewayProxyEvent
}

describe('putStationEntryLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetParam.mockImplementation((_event, name: string) => (name === 'eventId' ? 'event-1' : 'post-1'))
    mockGetLiveEvent.mockResolvedValue(confirmedEvent)
    // The results write reads the event again, consistently, for its lock.
    mockGetEvent.mockResolvedValue(confirmedEvent)
    storeRows([registration('reg-1')])
    mockQueryAdminConnections.mockResolvedValue([])
    mockPublishRegistrationPatches.mockImplementation(actualActions.publishRegistrationPatches)
  })

  it('answers with the saved scores when the live push after the write fails (KOE-1583)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockQueryAdminConnections.mockRejectedValueOnce(new Error('scan failed'))

    await putStationEntryLambda(apiEvent([{ eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1' }]))

    expect(mockWrittenResult).toHaveBeenCalledTimes(1)
    expect(mockResponse).toHaveBeenCalledWith(200, expect.anything(), expect.anything())
    expect(loggedLines(errorSpy)).toEqual([
      expect.objectContaining({ message: 'live push failed', publication: 'registration patches' }),
    ])
  })

  // A post stays open after the results are published: a correction there reaches the public list,
  // the dog's own result and its team's standing (KOE-1717).
  it('republishes the start list after a save that changed a result', async () => {
    await putStationEntryLambda(apiEvent([{ eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1' }]))

    expect(mockPublishPublicStartList).toHaveBeenCalledWith('event-1')
  })

  it('publishes nothing when the save changed nothing', async () => {
    const at = '2026-09-12T08:00:00.000Z'
    storeRows([
      asJsonRegistration({
        ...registration('reg-1'),
        eventResult: {
          tasks: [{ exercise: 1, part: 0, points: 17, updatedAt: at, updatedBy: 'x' }],
          updatedAt: at,
          updatedBy: 'x',
        },
        eventType: 'NOWT',
      }),
    ])

    await putStationEntryLambda(apiEvent([{ eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1' }]))

    expect(mockResponse).toHaveBeenCalledWith(200, expect.objectContaining({ saved: [] }), expect.anything())
    expect(mockPublishPublicStartList).not.toHaveBeenCalled()
  })

  describe("another post's scores (KOE-1665)", () => {
    const at = '2026-09-12T08:00:00.000Z'
    // Without a running order of its own the day's posts are done in number order: post 2 is exercise 2.
    const score = (exercise: number, points: number) => ({
      exercise,
      part: 0,
      points,
      updatedAt: at,
      updatedBy: 'x',
    })
    const stored = asJsonRegistration({
      class: 'AVO',
      eventId: 'event-1',
      eventResult: { tasks: [score(2, 15)], updatedAt: at, updatedBy: 'x' },
      eventType: 'NOWT',
      group: { date: '2026-09-12', key: 'AVO-AP', number: 1 },
      id: 'reg-1',
    })
    /** A result as the link is answered with it: this post's one score, no other post's. */
    const onlyThisPost = expect.objectContaining({ tasks: [expect.objectContaining({ exercise: 1 })] })

    it("keeps them beside this post's score and answers with this post's only", async () => {
      storeRows([stored])

      await putStationEntryLambda(apiEvent([{ eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1' }]))

      expect(mockWrittenResult).toHaveBeenCalledWith(
        'event-1',
        'reg-1',
        expect.objectContaining({
          tasks: [
            expect.objectContaining({ exercise: 2, points: 15 }),
            expect.objectContaining({ exercise: 1, part: 0, points: 17 }),
          ],
        })
      )
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ saved: [expect.objectContaining({ eventResult: onlyThisPost })] }),
        expect.anything()
      )
    })

    it('answers a conflict without them', async () => {
      storeRows([{ ...stored, eventResult: { ...stored.eventResult, tasks: [score(2, 15), score(1, 12)] } }])

      await putStationEntryLambda(
        apiEvent([{ basedOn: 'stale', eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1' }])
      )

      expect(mockResponse).toHaveBeenCalledWith(
        409,
        expect.objectContaining({
          conflicts: [expect.objectContaining({ stored: onlyThisPost, submitted: onlyThisPost })],
          error: 'resultConflict',
        }),
        expect.anything()
      )
    })
  })

  // A link this widely shared names nobody (KOE-1697); the tasks' times stay, since a save is based on them.
  describe("a writer's name", () => {
    const at = '2026-09-12T08:00:00.000Z'
    const stored = asJsonRegistration({
      class: 'AVO',
      eventId: 'event-1',
      eventResult: {
        tasks: [{ exercise: 1, part: 0, points: 12, updatedAt: at, updatedBy: 'Koesihteeri' }],
        updatedAt: at,
        updatedBy: 'Koesihteeri',
      },
      eventType: 'NOWT',
      group: { date: '2026-09-12', key: 'AVO-AP', number: 1 },
      id: 'reg-1',
    })
    const scored = (points: number) => ({ exercise: 1, part: 0, points, updatedAt: expect.any(String) })

    beforeEach(() => storeRows([stored]))

    it("stays out of a save's echo", async () => {
      await putStationEntryLambda(
        apiEvent([{ basedOn: at, eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1' }])
      )

      // Whole objects: anything more than these, a name included, fails the match.
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        {
          conflicts: [],
          saved: [{ eventResult: { tasks: [scored(17)], updatedAt: expect.any(String) }, id: 'reg-1' }],
          unchanged: [],
        },
        expect.anything()
      )
    })

    it('stays out of a conflict, whose version the next save is based on', async () => {
      await putStationEntryLambda(
        apiEvent([{ basedOn: 'stale', eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1' }])
      )

      expect(mockResponse).toHaveBeenCalledWith(
        409,
        expect.objectContaining({
          conflicts: [
            {
              id: 'reg-1',
              stationId: 'post-1',
              stored: { tasks: [{ exercise: 1, part: 0, points: 12, updatedAt: at }], updatedAt: at },
              submitted: { tasks: [scored(17)], updatedAt: expect.any(String) },
            },
          ],
        }),
        expect.anything()
      )
    })

    it('stays out of the dogs a batch wrote before it found the trial locked', async () => {
      const handedOver = { ...confirmedEvent, kcState: { code: 1253, name: 'x', readAt: 'y' } }
      storeRows([stored, { ...stored, id: 'reg-2' }, { ...stored, id: 'reg-3' }])
      // Asked before each dog that would change: open for the second, handed over by the third.
      mockGetEvent.mockResolvedValueOnce(confirmedEvent).mockResolvedValueOnce(handedOver)

      const refusal = putStationEntryLambda(
        apiEvent([
          { basedOn: at, eventResult: { tasks: [{ exercise: 1, points: 12 }] }, id: 'reg-1' },
          { basedOn: at, eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-2' },
          { basedOn: at, eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-3' },
        ])
      )

      await expect(refusal).rejects.toMatchObject({
        body: { error: 'resultsLocked', saved: [{ id: 'reg-2' }], unchanged: [{ id: 'reg-1' }] },
        status: 423,
      })
      await expect(refusal).rejects.toSatisfy(
        (error: { body: unknown }) => !JSON.stringify(error.body).includes('updatedBy')
      )
    })
  })

  describe('the outcome that ended the round (KOE-1615)', () => {
    const at = '2026-09-12T08:00:00.000Z'
    const post2 = { date: '2026-09-12', id: 'post-2', number: 2 }
    const version = { updatedAt: at, updatedBy: 'x' }
    const stored = (eventResult: object) => storeRows([{ ...registration('reg-1'), eventResult }])
    /** A save by post 2, which without a running order of its own is exercise 2. */
    const saveAtPost2 = (eventResult: object, basedOn?: string) => {
      mockGetParam.mockImplementation((_event, name: string) => (name === 'eventId' ? 'event-1' : 'post-2'))
      return putStationEntryLambda(
        apiEvent(
          [{ ...(basedOn ? { basedOn } : {}), eventResult, id: 'reg-1' }],
          getStationEntryToken('event-1', post2)
        )
      )
    }
    const written = (fields: object) =>
      expect(mockWrittenResult).toHaveBeenCalledWith('event-1', 'reg-1', expect.objectContaining(fields))

    const elsewhere = [
      ['elimination', { elimination: { exercise: 1, fault: 'hardMouth' } }],
      ['retirement', { retirement: { cause: 'injury', exercise: 1 } }],
    ] as const

    it.each(elsewhere)(
      "keeps another post's %s when a post saves its scores and no outcome",
      async (_name, outcome) => {
        stored({ tasks: [], ...version, ...outcome })

        await saveAtPost2({ tasks: [{ exercise: 2, points: 15 }] })

        written({ ...outcome, tasks: [expect.objectContaining({ exercise: 2, points: 15 })] })
        expect(mockResponse).toHaveBeenCalledWith(200, expect.anything(), expect.anything())
      }
    )

    it.each(elsewhere)("keeps another post's %s when a post sends an outcome of its own", async (_name, outcome) => {
      stored({ tasks: [], ...version, ...outcome })

      await saveAtPost2({ retirement: { cause: 'handlerChoice', exercise: 2 }, tasks: [{ exercise: 2, points: 15 }] })

      written(outcome)
      expect(mockWrittenResult).not.toHaveBeenCalledWith(
        'event-1',
        'reg-1',
        expect.objectContaining({ retirement: expect.objectContaining({ cause: 'handlerChoice' }) })
      )
    })

    it("reads a retry without the outcome as already stored, when the outcome is another post's", async () => {
      const outcome = { retirement: { cause: 'injury', exercise: 1 } }
      stored({ tasks: [{ exercise: 2, part: 0, points: 15, ...version }], ...version, ...outcome })

      await saveAtPost2({ tasks: [{ exercise: 2, points: 15 }] }, at)

      expect(mockWrittenResult).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ saved: [], unchanged: [expect.objectContaining({ id: 'reg-1' })] }),
        expect.anything()
      )
    })

    it('answers a conflict with the kept outcome rather than a cleared one', async () => {
      const outcome = { retirement: { cause: 'injury', exercise: 1 } }
      stored({ tasks: [{ exercise: 2, part: 0, points: 12, ...version }], ...version, ...outcome })

      await saveAtPost2({ tasks: [{ exercise: 2, points: 15 }] }, 'stale')

      expect(mockWrittenResult).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(
        409,
        expect.objectContaining({
          conflicts: [
            expect.objectContaining({
              stored: expect.objectContaining(outcome),
              submitted: expect.objectContaining(outcome),
            }),
          ],
        }),
        expect.anything()
      )
    })

    it('keeps an outcome stored without a place, which no post recorded', async () => {
      const outcome = { retirement: { cause: 'injury' } }
      stored({ tasks: [], ...version, ...outcome })

      await saveAtPost2({ tasks: [{ exercise: 2, points: 15 }] })

      written(outcome)
    })

    it('lets a post clear the outcome at its own exercise', async () => {
      stored({ tasks: [], ...version, retirement: { cause: 'injury', exercise: 2 } })

      await saveAtPost2({ tasks: [{ exercise: 2, points: 15 }] })

      expect(mockWrittenResult).toHaveBeenCalledTimes(1)
      expect(mockWrittenResult).not.toHaveBeenCalledWith(
        'event-1',
        'reg-1',
        expect.objectContaining({ retirement: expect.anything() })
      )
    })

    it('lets a post change the outcome at its own exercise', async () => {
      stored({ tasks: [], ...version, retirement: { cause: 'injury', exercise: 2 } })

      await saveAtPost2({ retirement: { cause: 'illness', exercise: 2 }, tasks: [] })

      written({ retirement: { cause: 'illness', exercise: 2 } })
    })

    const noOutcome = (call: object) =>
      expect(mockWrittenResult).not.toHaveBeenCalledWith('event-1', 'reg-1', expect.objectContaining(call))

    it.each([
      ["another post's exercise", { elimination: { exercise: 1, fault: 'hardMouth' } }],
      ["another post's exercise, as a retirement", { retirement: { cause: 'injury', exercise: 1 } }],
      ['no exercise', { retirement: { cause: 'injury' } }],
    ])(
      'saves the scores without an outcome naming %s, as a page echoing a cleared one does',
      async (_name, outcome) => {
        await saveAtPost2({ ...outcome, tasks: [{ exercise: 2, points: 15 }] })

        written({ tasks: [expect.objectContaining({ exercise: 2, points: 15 })] })
        noOutcome({ elimination: expect.anything() })
        noOutcome({ retirement: expect.anything() })
      }
    )

    it("keeps the post's own outcome when the body names another post's", async () => {
      const own = { retirement: { cause: 'injury', exercise: 2 } }
      stored({ tasks: [], ...version, ...own })

      await saveAtPost2({ retirement: { cause: 'illness', exercise: 1 }, tasks: [{ exercise: 2, points: 15 }] })

      written(own)
    })

    it("keeps an outcome at an exercise the dog's round no longer has", async () => {
      const gone = { retirement: { cause: 'injury', exercise: 9 } }
      stored({ tasks: [], ...version, ...gone })

      await saveAtPost2({ tasks: [{ exercise: 2, points: 15 }] })

      written(gone)
    })

    it('ignores an outcome for a dog whose group does not come to this post', async () => {
      const elsewhereOnly = {
        ...confirmedEvent,
        rotations: [{ class: 'AVO', exercises: [{ stationId: 'post-1' }] }],
      }
      mockGetLiveEvent.mockResolvedValue(elsewhereOnly)
      mockGetEvent.mockResolvedValue(elsewhereOnly)

      await saveAtPost2({ retirement: { cause: 'injury', exercise: 1 }, tasks: [] })

      expect(mockWrittenResult).not.toHaveBeenCalled()
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ saved: [], unchanged: [expect.objectContaining({ id: 'reg-1' })] }),
        expect.anything()
      )
    })

    it('still refuses a dog that did not run as such, rather than as a stale page', async () => {
      storeRows([{ ...registration('reg-1'), cancelled: true }])

      await expect(saveAtPost2({ retirement: { cause: 'injury', exercise: 1 }, tasks: [] })).rejects.toThrow(
        'did not run'
      )
    })

    describe('a qualitative type', () => {
      const nomeB = asJsonConfirmedEvent({
        classes: [],
        eventType: 'NOME-B',
        id: 'event-1',
        organizer: { id: 'org-1', name: 'Org' },
        startDate: '2026-09-12',
      })

      it("places the outcome at the path's post, whatever the body claims", async () => {
        mockGetLiveEvent.mockResolvedValue(nomeB)
        mockGetEvent.mockResolvedValue(nomeB)
        mockGetParam.mockImplementation((_event, name: string) => (name === 'eventId' ? 'event-1' : '1'))

        await putStationEntryLambda(
          apiEvent(
            [
              {
                eventResult: { resultCode: '0', retirement: { cause: 'judgeStopped', stationId: 'elsewhere' } },
                id: 'reg-1',
              },
            ],
            getStationEntryToken('event-1', { id: '1' })
          )
        )

        written({ retirement: { cause: 'judgeStopped', stationId: '1' } })
      })
    })
  })

  describe('a task list larger than the post (KOE-1616)', () => {
    it('refuses the same exercise and part twice, and writes and audits nothing', async () => {
      const request = putStationEntryLambda(
        apiEvent([
          {
            eventResult: {
              tasks: [
                { exercise: 1, points: 17 },
                { exercise: 1, part: 0, points: 12 },
              ],
            },
            id: 'reg-1',
          },
        ])
      )

      await expect(request).rejects.toMatchObject({ statusCode: 422 })
      await expect(request).rejects.toThrow('Task exercise 1#0 is sent twice')
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it("refuses the post's one exercise sent many times over", async () => {
      const tasks = Array.from({ length: 100 }, () => ({ exercise: 1, points: 17 }))

      await expect(putStationEntryLambda(apiEvent([{ eventResult: { tasks }, id: 'reg-1' }]))).rejects.toMatchObject({
        statusCode: 422,
      })
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('refuses a task for a type judged as a whole, which has none', async () => {
      const nomeB = asJsonConfirmedEvent({
        classes: [],
        eventType: 'NOME-B',
        id: 'event-1',
        organizer: { id: 'org-1', name: 'Org' },
        startDate: '2026-09-12',
      })
      mockGetLiveEvent.mockResolvedValue(nomeB)
      mockGetEvent.mockResolvedValue(nomeB)
      mockGetParam.mockImplementation((_event, name: string) => (name === 'eventId' ? 'event-1' : '1'))

      const request = putStationEntryLambda(
        apiEvent(
          [{ eventResult: { resultCode: '1', tasks: [{ exercise: 1, points: 10 }] }, id: 'reg-1' }],
          getStationEntryToken('event-1', { id: '1' })
        )
      )

      await expect(request).rejects.toMatchObject({ statusCode: 422 })
      await expect(request).rejects.toThrow('Tasks are not taken for NOME-B')
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('refuses the same dog twice in one request', async () => {
      const request = putStationEntryLambda(
        apiEvent([
          { eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1' },
          { eventResult: { tasks: [{ exercise: 1, points: 12 }] }, id: 'reg-1' },
        ])
      )

      await expect(request).rejects.toMatchObject({ statusCode: 422 })
      await expect(request).rejects.toThrow("Registration 'reg-1' is sent twice")
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
      expect(mockAudit).not.toHaveBeenCalled()
    })
  })

  it('refuses a body with no results before reading the registrations', async () => {
    await expect(putStationEntryLambda(apiEvent([]))).rejects.toMatchObject({ body: 'no results', status: 422 })

    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    expect(mockWrittenResult).not.toHaveBeenCalled()
  })

  it('refuses a wrong token before touching anything', async () => {
    await expect(
      putStationEntryLambda(apiEvent([{ eventResult: { tasks: [] }, id: 'reg-1' }], 'wrong'))
    ).rejects.toThrow('not found')

    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    expect(mockWrittenResult).not.toHaveBeenCalled()
  })

  // KOE-1586: the station link of a deleted event still saved results.
  it('answers a deleted event as a missing one, and writes nothing', async () => {
    mockGetEvent.mockResolvedValue(deletedEvent(confirmedEvent))
    mockGetLiveEvent.mockRejectedValue(eventNotFound('event-1'))

    await expect(
      putStationEntryLambda(apiEvent([{ eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1' }]))
    ).rejects.toMatchObject({ status: 404 })

    expect(mockGetLiveEvent).toHaveBeenCalledWith('event-1')
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
    expect(mockWrittenResult).not.toHaveBeenCalled()
  })

  it('saves under this post and attributes the write to it, whatever the body claims', async () => {
    await putStationEntryLambda(
      apiEvent([
        {
          eventResult: { tasks: [{ exercise: 1, points: 17 }] },
          id: 'reg-1',
          // A claimed scope is overridden by the path: this link is one post's and nothing else's.
          stationId: 'post-2',
        },
      ])
    )

    expect(mockWrittenResult).toHaveBeenCalledTimes(1)
    expect(mockWrittenResult).toHaveBeenCalledWith(
      'event-1',
      'reg-1',
      expect.objectContaining({
        tasks: [expect.objectContaining({ exercise: 1, part: 0, points: 17, updatedBy: 'Suorituspaikka 1' })],
      })
    )

    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ user: 'Suorituspaikka 1' }))
  })

  it('refuses an exercise the post does not do, so a page opened before the order changed reloads (KOE-1665)', async () => {
    await expect(
      putStationEntryLambda(apiEvent([{ eventResult: { tasks: [{ exercise: 2, points: 20 }] }, id: 'reg-1' }]))
    ).rejects.toMatchObject({ status: 409 })

    expect(mockWrittenResult).not.toHaveBeenCalled()
  })

  it('refuses a result code for a round scored at posts, whose result is derived (§5.4.1, KOE-1678)', async () => {
    await expect(
      putStationEntryLambda(
        apiEvent([{ eventResult: { resultCode: '1', tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1' }])
      )
    ).rejects.toThrow("Result code '1' is not taken for NOWT: its result is derived from the scores")

    expect(mockWrittenResult).not.toHaveBeenCalled()
  })

  it('drops the whole-round fields a station link may not write', async () => {
    await putStationEntryLambda(
      apiEvent([
        {
          eventResult: {
            cert: true,
            junk: 'x',
            notes: 'ei rastin asia',
            resCert: true,
            tasks: [{ exercise: 1, points: 17 }],
          },
          id: 'reg-1',
        },
      ])
    )

    // The certs and the notes are the event secretary's; a widely shared link writes its post's scores
    // and outcome, nothing else. The round is incomplete, so no result is derived either.
    for (const field of ['cert', 'junk', 'notes', 'resCert', 'result']) {
      expect(mockWrittenResult).not.toHaveBeenCalledWith(
        'event-1',
        'reg-1',
        expect.objectContaining({ [field]: expect.anything() })
      )
    }
    expect(mockWrittenResult).toHaveBeenCalledWith(
      'event-1',
      'reg-1',
      expect.objectContaining({ tasks: [expect.objectContaining({ exercise: 1, points: 17 })] })
    )
    // As last written, as on the event secretary's endpoint (KOE-1490).
    expect(mockReadEventRegistrations).toHaveBeenCalledWith('event-1', true)
  })

  it('saves a round-ending outcome that arrives without a score', async () => {
    await putStationEntryLambda(
      apiEvent([{ eventResult: { retirement: { cause: 'injury', exercise: 1 }, tasks: [] }, id: 'reg-1' }])
    )

    expect(mockWrittenResult).toHaveBeenCalledTimes(1)
    expect(mockWrittenResult).toHaveBeenCalledWith(
      'event-1',
      'reg-1',
      expect.objectContaining({ result: 'AVO-', retirement: { cause: 'injury', exercise: 1 } })
    )
  })

  it('echoes back only what the link may see', async () => {
    storeRows([
      {
        ...registration('reg-1'),
        eventResult: {
          tasks: [{ exercise: 2, part: 0, points: 12, updatedAt: 't2', updatedBy: 'u' }],
          updatedAt: 't2',
          updatedBy: 'u',
        },
      },
    ])

    await putStationEntryLambda(
      apiEvent([
        {
          basedOn: undefined,
          eventResult: { tasks: [{ exercise: 1, points: 17 }] },
          id: 'reg-1',
        },
      ])
    )

    // The stored round holds another post's score and, once complete, the prize; neither is this link's
    // to see.
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        saved: [
          {
            eventResult: {
              tasks: [expect.objectContaining({ exercise: 1 })],
              updatedAt: expect.any(String),
            },
            id: 'reg-1',
          },
        ],
      }),
      expect.anything()
    )
  })
  it('refuses the post once the trial is handed to the chief judge, with its own status and code', async () => {
    const handedOver = { ...confirmedEvent, kcState: { code: 1253, name: 'x', readAt: 'y' } }
    mockGetLiveEvent.mockResolvedValue(handedOver)
    mockGetEvent.mockResolvedValue(handedOver)

    await expect(
      putStationEntryLambda(apiEvent([{ eventResult: { tasks: [{ exercise: 1, points: 17 }] }, id: 'reg-1' }]))
    ).rejects.toMatchObject({ body: { error: 'resultsLocked' }, status: 423 })

    expect(mockWrittenResult).not.toHaveBeenCalled()
  })

  describe('an outcome without a place, stored since the page was read (KOE-1703)', () => {
    const at = '2026-09-12T08:00:00.000Z'

    it('saves the score of a stale page and keeps the outcome, so no stamp has to move for it', async () => {
      storeRows([
        {
          ...registration('reg-1'),
          eventResult: {
            retirement: { cause: 'injury' },
            tasks: [{ exercise: 1, part: 0, points: 15, updatedAt: at, updatedBy: 'Suorituspaikka 1' }],
            updatedAt: '2026-09-12T08:05:00.000Z',
            updatedBy: 'Sihteeri',
          },
        },
      ])

      await putStationEntryLambda(
        apiEvent([{ basedOn: at, eventResult: { tasks: [{ exercise: 1, part: 0, points: 18 }] }, id: 'reg-1' }])
      )

      expect(mockWrittenResult).toHaveBeenCalledWith(
        'event-1',
        'reg-1',
        expect.objectContaining({
          retirement: { cause: 'injury' },
          tasks: [expect.objectContaining({ exercise: 1, points: 18 })],
        })
      )
    })
  })
})
