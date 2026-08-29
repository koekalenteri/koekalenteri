import type { EventClassTask, JsonEventResultTask } from '../types'
import type { ScoredTask } from './results'
import {
  availableResultCodes,
  deriveNowtResult,
  eventResultPrefix,
  formatEventResult,
  invalidTaskTotals,
  nowtTotals,
  taskEntryCeiling,
  toScoredTasks,
} from './results'

/** One task at its own post, the common layout. */
const task = (stationId: string, points: number | null, maxPoints = 20): ScoredTask => ({
  maxPoints,
  points,
  stationId,
})

/** A four-post round, one task each, scored as given. */
const round = (...points: (number | null)[]): ScoredTask[] =>
  points.map((value, index) => task(`post-${index + 1}`, value))

describe('nowtTotals', () => {
  it('sums points and maxima and reports the exact ratio', () => {
    expect(nowtTotals(round(17, 18, 16, 14))).toEqual({ maxPoints: 80, percentage: 81.25, points: 65 })
  })

  it('counts an unscored task as no points without dropping it from the maximum', () => {
    expect(nowtTotals(round(20, 20, 20, null))).toEqual({ maxPoints: 80, percentage: 75, points: 60 })
  })

  it('does not divide by zero on an empty round', () => {
    expect(nowtTotals([])).toEqual({ maxPoints: 0, percentage: 0, points: 0 })
  })
})

describe('deriveNowtResult', () => {
  it('awards a first prize on 65 of 80, which the absolute rules figure calls a second', () => {
    // The case the percentage rule exists for: 65 points is §5.8.1's second-prize number, but on a
    // four-post round it is 81.25 % and every post clears its floor of 10.
    expect(deriveNowtResult({ tasks: round(17, 18, 16, 14) })).toBe('1')
  })

  it('applies the per-post floor to a split post, not to its individual tasks', () => {
    const tasks = [
      task('post-1', 9, 10),
      task('post-1', 8, 10),
      task('post-2', 18),
      task('post-3', 16),
      task('post-4', 14),
    ]

    // 9 and 8 each fall under 10, but the post totals 17 of 20 and clears the floor.
    expect(deriveNowtResult({ tasks })).toBe('1')
  })

  it('drops to a second prize when one post falls below half', () => {
    // 80 % overall, but post 4 yields 9 of 20.
    expect(deriveNowtResult({ tasks: round(20, 20, 15, 9) })).toBe('2')
  })

  it('uses the ratio rather than a rounded percentage at the boundary', () => {
    // 51 of 80 is 63.75 %, which rounds to 64 % but must not reach the 65 % second prize.
    expect(deriveNowtResult({ tasks: round(13, 13, 13, 12) })).toBe('3')
    // 52 of 80 is exactly 65 %.
    expect(deriveNowtResult({ tasks: round(13, 13, 13, 13) })).toBe('2')
  })

  it('bars every prize when a single task scored zero', () => {
    // 60 of 80 is 75 %, comfortably a second prize, but a zero cannot be rewarded.
    expect(deriveNowtResult({ tasks: round(20, 20, 20, 0) })).toBe('0')
  })

  it('gives a third prize at exactly half and a zero below it', () => {
    expect(deriveNowtResult({ tasks: round(10, 10, 10, 10) })).toBe('3')
    expect(deriveNowtResult({ tasks: round(10, 10, 10, 9) })).toBe('0')
  })

  it('returns nothing while the round is still being entered', () => {
    expect(deriveNowtResult({ tasks: round(17, 18, null, null) })).toBeUndefined()
    expect(deriveNowtResult({ tasks: [] })).toBeUndefined()
  })

  describe('voided rounds', () => {
    it('records every eliminating fault as a dash rather than a zero', () => {
      expect(deriveNowtResult({ eliminatedBy: 'hardMouth', tasks: round(17, null, null, null) })).toBe('-')
      expect(deriveNowtResult({ eliminatedBy: 'harshHandling', tasks: round(17, null, null, null) })).toBe('-')
    })

    it('records an injured dog as a dash without asking about contention', () => {
      expect(deriveNowtResult({ retirement: { cause: 'injury' }, tasks: round(17, null, null, null) })).toBe('-')
    })

    it("dashes a handler's withdrawal only where the dog could still have placed", () => {
      const tasks = round(17, null, null, null)

      expect(deriveNowtResult({ retirement: { cause: 'handlerChoice', couldStillHavePlaced: true }, tasks })).toBe('-')
      expect(deriveNowtResult({ retirement: { cause: 'handlerChoice', couldStillHavePlaced: false }, tasks })).toBe('0')
    })

    it('settles an exclusion before the zero rule, so the dog is not reported as having failed on merit', () => {
      expect(deriveNowtResult({ eliminatedBy: 'aggression', tasks: round(0, 18, 16, 14) })).toBe('-')
    })

    it('settles a voided round before completeness, so an unfinished scorecard still resolves', () => {
      expect(deriveNowtResult({ eliminatedBy: 'gunShyness', tasks: [] })).toBe('-')
    })
  })
})

describe('taskEntryCeiling', () => {
  it('leaves an uninterrupted task at its full maximum', () => {
    expect(taskEntryCeiling({ maxPoints: 20 })).toBe(20)
  })

  it('halves the ceiling for a recalled ALO dog', () => {
    expect(taskEntryCeiling({ maxPoints: 20, recalled: true })).toBe(10)
    expect(taskEntryCeiling({ maxPoints: 10, recalled: true })).toBe(5)
  })

  it('leaves a recalled dog needing a flawless re-send to keep a first prize', () => {
    // The ceiling and the per-post floor meet at 10, so only a perfect remainder stays eligible. This
    // is the intended penalty, not an off-by-one: scoring against the reduced ceiling instead would
    // hand out first prizes the rules disallow.
    const ceiling = taskEntryCeiling({ maxPoints: 20, recalled: true })

    expect(deriveNowtResult({ tasks: [...round(20, 20, 20), task('post-4', ceiling)] })).toBe('1')
    expect(deriveNowtResult({ tasks: [...round(20, 20, 20), task('post-4', ceiling - 1)] })).toBe('2')
  })
})

describe('toScoredTasks', () => {
  const tasks: EventClassTask[] = [
    { id: 'a', maxPoints: 10, number: 1, stationId: 'post-1' },
    { id: 'b', maxPoints: 10, number: 2, stationId: 'post-1' },
    { id: 'c', maxPoints: 20, number: 3, stationId: 'post-2' },
  ]

  const scored = (taskId: string, points: number | null): JsonEventResultTask => ({
    points,
    taskId,
    updatedAt: '2026-08-29T10:00:00.000Z',
    updatedBy: 'secretary',
  })

  it('joins entries onto the layout', () => {
    expect(toScoredTasks(tasks, [scored('a', 9), scored('b', 8), scored('c', 18)])).toEqual([
      { maxPoints: 10, points: 9, stationId: 'post-1' },
      { maxPoints: 10, points: 8, stationId: 'post-1' },
      { maxPoints: 20, points: 18, stationId: 'post-2' },
    ])
  })

  it('reads a task with no entry as unscored instead of dropping it from the maximum', () => {
    const result = toScoredTasks(tasks, [scored('a', 9)])

    expect(result.map((item) => item.points)).toEqual([9, null, null])
    expect(nowtTotals(result).maxPoints).toBe(40)
  })

  it('ignores entries for tasks the layout no longer holds', () => {
    expect(toScoredTasks([tasks[0]], [scored('a', 9), scored('removed', 20)])).toEqual([
      { maxPoints: 10, points: 9, stationId: 'post-1' },
    ])
  })
})

describe('availableResultCodes', () => {
  it('offers the placed codes for a class-based event type', () => {
    expect(availableResultCodes('NOWT')).toEqual(['1', '2', '3', '0', '-'])
    expect(availableResultCodes('NOME-B')).toEqual(['1', '2', '3', '0', '-'])
  })

  it('offers only a pass and a fail where the test is not placed', () => {
    expect(availableResultCodes('NOU')).toEqual(['1', '0'])
    expect(availableResultCodes('NKM')).toEqual(['1', '0'])
  })

  it('treats a championship as its class-based parent', () => {
    expect(availableResultCodes('NOWT SM')).toEqual(['1', '2', '3', '0', '-'])
  })
})

describe('eventResultPrefix', () => {
  it('prefers the class where the event has classes', () => {
    expect(eventResultPrefix('NOWT', 'AVO')).toBe('AVO')
  })

  it('falls back to the event type where there are none', () => {
    expect(eventResultPrefix('NOU')).toBe('NOU')
  })
})

describe('formatEventResult', () => {
  it('composes a classed result', () => {
    expect(formatEventResult('1', 'NOWT', 'AVO')).toBe('AVO1')
    expect(formatEventResult('-', 'NOME-B', 'ALO')).toBe('ALO-')
  })

  it('composes a pass or fail for an event type without classes', () => {
    expect(formatEventResult('1', 'NOU')).toBe('NOU1')
    expect(formatEventResult('0', 'NKM')).toBe('NKM0')
  })
})

describe('invalidTaskTotals', () => {
  const stations = [
    { id: 'post-1', maxPoints: 20 },
    { id: 'post-2', maxPoints: 20 },
  ]

  it('accepts a post split into two halves', () => {
    expect(
      invalidTaskTotals(stations, [
        { id: 'a', maxPoints: 10, number: 1, stationId: 'post-1' },
        { id: 'b', maxPoints: 10, number: 2, stationId: 'post-1' },
        { id: 'c', maxPoints: 20, number: 3, stationId: 'post-2' },
      ])
    ).toEqual([])
  })

  it('reports a split that does not add up to the post', () => {
    expect(
      invalidTaskTotals(stations, [
        { id: 'a', maxPoints: 20, number: 1, stationId: 'post-1' },
        { id: 'b', maxPoints: 10, number: 2, stationId: 'post-1' },
      ])
    ).toEqual(['post-1'])
  })

  it('ignores a post that carries no tasks for this class', () => {
    expect(invalidTaskTotals(stations, [{ id: 'c', maxPoints: 20, number: 1, stationId: 'post-2' }])).toEqual([])
  })
})
