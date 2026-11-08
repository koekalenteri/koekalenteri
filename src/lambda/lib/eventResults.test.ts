import type { JsonEventResult, JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { asJsonConfirmedEvent, asJsonRegistration } from '../test-utils/helpers'
import { conditionalCheckFailure, registrationStore } from '../test-utils/registrationStore'

const registrations = registrationStore()
const mockReadRegistration = vi.fn(registrations.readRegistration)
const mockWriteEventResult = vi.fn(registrations.writeEventResult)
const mockAudit = vi.fn()
const mockGetEvent = vi.fn()

vi.doMock('./repositories/registrationRepository', () => ({
  readEventRegistrations: registrations.readEventRegistrations,
  readRegistration: mockReadRegistration,
  writeEventResult: mockWriteEventResult,
}))
vi.doMock('./audit', () => ({ audit: mockAudit, registrationAuditKey: vi.fn() }))
vi.doMock('./event', () => ({ getEvent: mockGetEvent, RESULTS_WRITE_ATTEMPTS: 3 }))

const { processResultSubmissions, stationScopedSubmission } = await import('./eventResults')

describe('eventResults', () => {
  /**
   * Another request wrote the dog after this batch read it (KOE-1490): the store holds what that request
   * wrote, and the batch is handed the reading from before it.
   */
  describe('processResultSubmissions over a dog written since it was read', () => {
    const stations = [1, 2, 3, 4].map((number) => ({ date: '2026-09-12' as const, id: `post-${number}`, number }))
    const nowt = asJsonConfirmedEvent({ classes: [], eventType: 'NOWT', id: 'event-1', stations })
    const dog = (id: string, eventResult?: JsonEventResult): JsonRegistration =>
      asJsonRegistration({
        class: 'AVO',
        eventId: 'event-1',
        ...(eventResult ? { eventResult } : {}),
        group: { date: '2026-09-12', key: 'AVO-AP', number: 1 },
        id,
      })
    const at = (updatedAt: string, updatedBy: string) => ({ updatedAt, updatedBy })
    const task = (exercise: number, points: number) => ({ exercise, part: 0, points })
    const stamped = (exercise: number, points: number, updatedAt: string) => ({
      ...task(exercise, points),
      ...at(updatedAt, 'Toinen'),
    })
    /** A whole round of 10s from before, and the round another secretary saved over it. */
    const before: JsonEventResult = { tasks: [1, 2, 3, 4].map((n) => stamped(n, 10, 't0')), ...at('t0', 'Toinen') }
    const other: JsonEventResult = {
      maxPoints: 80,
      percentage: 81.25,
      points: 65,
      result: 'AVO1',
      tasks: [17, 18, 16, 14].map((points, index) => stamped(index + 1, points, 't1')),
      ...at('t1', 'Toinen'),
    }

    const process = (
      reading: JsonRegistration[],
      submissions: Parameters<typeof processResultSubmissions>[3],
      stationId?: string
    ) => processResultSubmissions('event-1', nowt, reading, submissions, 'Sihteeri', stationId)

    beforeEach(() => {
      vi.clearAllMocks()
      mockGetEvent.mockResolvedValue(nowt)
      mockWriteEventResult.mockImplementation(registrations.writeEventResult)
    })

    it('reports a different whole round as a conflict with the result that landed, and writes nothing', async () => {
      registrations.store([dog('reg-1', other)])

      const answer = await process(
        [dog('reg-1', before)],
        [{ basedOn: 't0', eventResult: { tasks: [1, 2, 3, 4].map((n) => task(n, 12)) }, id: 'reg-1' }]
      )

      expect(answer).toMatchObject({
        conflicts: [{ id: 'reg-1', stored: other, submitted: { points: 48 } }],
        patches: [],
        saved: [],
        unchanged: [],
      })
      expect(mockReadRegistration).toHaveBeenCalledWith('event-1', 'reg-1', true)
      expect(mockWriteEventResult).toHaveBeenCalledTimes(1)
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('answers the same round as unchanged when the other request saved it first', async () => {
      registrations.store([dog('reg-1', other)])

      const answer = await process(
        [dog('reg-1', before)],
        [{ basedOn: 't0', eventResult: { tasks: [17, 18, 16, 14].map((p, i) => task(i + 1, p)) }, id: 'reg-1' }]
      )

      expect(answer).toMatchObject({ conflicts: [], saved: [], unchanged: [{ eventResult: other, id: 'reg-1' }] })
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it("merges another post's save into this post's, and audits and patches the write that landed", async () => {
      const first: JsonEventResult = { tasks: [stamped(1, 17, 't1')], ...at('t1', 'Suorituspaikka 1') }
      registrations.store([dog('reg-1', first)])

      const answer = await process([dog('reg-1')], [{ eventResult: { tasks: [task(2, 18)] }, id: 'reg-1' }], 'post-2')

      const tasks = [
        expect.objectContaining({ exercise: 1, points: 17 }),
        expect.objectContaining({ exercise: 2, points: 18 }),
      ]
      expect(answer).toMatchObject({
        conflicts: [],
        patches: [{ eventResult: { tasks }, id: 'reg-1' }],
        saved: [{ eventResult: { tasks }, id: 'reg-1' }],
      })
      expect(mockWriteEventResult).toHaveBeenCalledTimes(2)
      expect(mockAudit).toHaveBeenCalledTimes(1)
    })

    it("scopes a post's save again against the row read afresh, so another post's outcome stays", async () => {
      const elimination = { exercise: 1, fault: 'hardMouth' as const }
      registrations.store([
        dog('reg-1', { elimination, tasks: [stamped(1, 0, 't1')], ...at('t1', 'Suorituspaikka 1') }),
      ])

      const answer = await process([dog('reg-1')], [{ eventResult: { tasks: [task(2, 18)] }, id: 'reg-1' }], 'post-2')

      expect(answer.saved).toEqual([{ eventResult: expect.objectContaining({ elimination }), id: 'reg-1' }])
    })

    it('reports a save that keeps losing as a conflict with the last reading, and goes on with the other dogs', async () => {
      const first: JsonEventResult = { tasks: [stamped(1, 17, 't1')], ...at('t1', 'Suorituspaikka 1') }
      registrations.store([dog('reg-1', first), dog('reg-2')])
      mockWriteEventResult.mockImplementation(async (eventId, id, eventResult, readUpdatedAt) => {
        if (id === 'reg-1') throw conditionalCheckFailure()
        return registrations.writeEventResult(eventId, id, eventResult, readUpdatedAt)
      })

      const answer = await process(
        [dog('reg-1'), dog('reg-2')],
        [
          { eventResult: { tasks: [task(2, 18)] }, id: 'reg-1' },
          { eventResult: { tasks: [task(2, 12)] }, id: 'reg-2' },
        ],
        'post-2'
      )

      expect(answer.conflicts).toEqual([
        expect.objectContaining({ id: 'reg-1', stationId: 'post-2', stored: first, submitted: expect.any(Object) }),
      ])
      expect(answer.saved).toEqual([expect.objectContaining({ id: 'reg-2' })])
      expect(mockWriteEventResult).toHaveBeenCalledTimes(4)
    })

    it('lets the failure through when the save kept losing and no result was ever read', async () => {
      registrations.store([dog('reg-1')])
      const failure = conditionalCheckFailure()
      mockWriteEventResult.mockRejectedValue(failure)

      await expect(
        process([dog('reg-1')], [{ eventResult: { tasks: [task(2, 18)] }, id: 'reg-1' }], 'post-2')
      ).rejects.toBe(failure)
    })

    it('lets any other failure of the write through at once', async () => {
      registrations.store([dog('reg-1')])
      const failure = Object.assign(new Error('throttled'), { name: 'ProvisionedThroughputExceededException' })
      mockWriteEventResult.mockRejectedValueOnce(failure)

      await expect(
        process([dog('reg-1')], [{ eventResult: { tasks: [task(2, 18)] }, id: 'reg-1' }], 'post-2')
      ).rejects.toBe(failure)
      expect(mockReadRegistration).not.toHaveBeenCalled()
    })
  })

  describe('stationScopedSubmission', () => {
    const judge = { id: 123, name: 'Tuomari' }
    const submission = {
      basedOn: 'v1',
      eventResult: {
        cert: true,
        elimination: { exercise: 1, fault: 'hardMouth' as const },
        judge,
        notes: 'not the link to say',
        resultCode: '1' as const,
        tasks: [{ exercise: 1, part: 0, points: 17 }],
      },
      id: 'run-1',
      stationId: 'claimed-elsewhere',
    }
    const stations = [
      { date: '2026-09-12' as const, id: 'post-1', number: 1 },
      { date: '2026-09-12' as const, id: 'post-2', number: 2 },
    ]
    const nowt = asJsonConfirmedEvent({ classes: [], eventType: 'NOWT', id: 'event-1', stations })
    const nomeB = asJsonConfirmedEvent({ classes: [], eventType: 'NOME-B', id: 'event-1' })
    const dog = (eventResult?: object) =>
      asJsonRegistration({
        class: 'AVO',
        eventId: 'event-1',
        ...(eventResult ? { eventResult } : {}),
        group: { date: '2026-09-12', key: 'AVO-AP', number: 1 },
        id: 'run-1',
      })
    const version = { updatedAt: 't', updatedBy: 'x' }
    const outcomeOf = (scoped: ReturnType<typeof stationScopedSubmission>) => {
      const { elimination, retirement } = scoped.eventResult
      return { elimination, retirement }
    }

    it("forces the path's post and keeps only what a post may record of a scored round", () => {
      expect(stationScopedSubmission(submission, 'post-1', nowt, dog())).toEqual({
        basedOn: 'v1',
        eventResult: {
          elimination: { exercise: 1, fault: 'hardMouth' },
          tasks: [{ exercise: 1, part: 0, points: 17 }],
        },
        id: 'run-1',
        stationId: 'post-1',
      })
    })

    it("lets a qualitative type's verdict and judge through, its outcome at the path's post", () => {
      expect(stationScopedSubmission(submission, '1', nomeB, dog()).eventResult).toEqual({
        elimination: { exercise: 1, fault: 'hardMouth', stationId: '1' },
        judge,
        resultCode: '1',
        tasks: [{ exercise: 1, part: 0, points: 17 }],
      })
    })

    it("places a qualitative type's retirement at the path's post too", () => {
      const scoped = stationScopedSubmission(
        { eventResult: { retirement: { cause: 'judgeStopped', stationId: 'elsewhere' } }, id: 'run-1' },
        '1',
        nomeB,
        dog()
      )

      expect(scoped.eventResult.retirement).toEqual({ cause: 'judgeStopped', stationId: '1' })
    })

    it("keeps the pair stored at another post's exercise, whatever the body says", () => {
      const stored = { retirement: { cause: 'injury', exercise: 2 } }

      expect(outcomeOf(stationScopedSubmission(submission, 'post-1', nowt, dog({ ...version, ...stored })))).toEqual({
        elimination: undefined,
        retirement: stored.retirement,
      })
    })

    it('drops a submitted outcome held elsewhere, and clears nothing when none is stored', () => {
      expect(outcomeOf(stationScopedSubmission(submission, 'post-2', nowt, dog()))).toEqual({
        elimination: undefined,
        retirement: undefined,
      })
    })

    it('lets the submitted outcome stand over one stored at the same post', () => {
      const stored = { retirement: { cause: 'injury', exercise: 1 } }

      expect(outcomeOf(stationScopedSubmission(submission, 'post-1', nowt, dog({ ...version, ...stored })))).toEqual({
        elimination: submission.eventResult.elimination,
        retirement: undefined,
      })
    })
  })
})
