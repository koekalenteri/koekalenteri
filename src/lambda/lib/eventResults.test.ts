import { asJsonConfirmedEvent, asJsonRegistration } from '../test-utils/helpers'
import { stationScopedSubmission } from './eventResults'

describe('eventResults', () => {
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

    it('leaves a registration not on the event for the classification to refuse', () => {
      expect(stationScopedSubmission(submission, 'post-1', nowt, undefined).eventResult.elimination).toBeUndefined()
    })
  })
})
