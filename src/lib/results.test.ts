import type { JsonEventResult, JsonEventResultTask } from '../types'
import type { ScoredTask, SubmittedEventResult } from './results'
import {
  availableResultCodes,
  classRound,
  deriveNowtResult,
  eliminatingFaults,
  eventResultPrefix,
  formatEventResult,
  mergeStationTasks,
  nowtTotals,
  parseEventResultCode,
  resolveEventResult,
  sameEventResult,
  sameStationTasks,
  stationVersion,
  taskEntryCeiling,
  taskMaxPoints,
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

  it('gates only the first prize on the per-post floor', () => {
    // 50 of 80 is 62.5 %, and two posts sit at 5 of 20 — well under half. Second and third prizes go
    // on the total alone, so this is a third prize rather than a zero.
    expect(deriveNowtResult({ tasks: round(20, 20, 5, 5) })).toBe('3')
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
      expect(deriveNowtResult({ elimination: { fault: 'hardMouth' }, tasks: round(17, null, null, null) })).toBe('-')
      expect(deriveNowtResult({ elimination: { fault: 'harshHandling' }, tasks: round(17, null, null, null) })).toBe(
        '-'
      )
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
      expect(deriveNowtResult({ elimination: { fault: 'aggression' }, tasks: round(0, 18, 16, 14) })).toBe('-')
    })

    it('settles a voided round before completeness, so an unfinished scorecard still resolves', () => {
      expect(deriveNowtResult({ elimination: { fault: 'gunShyness' }, tasks: [] })).toBe('-')
    })

    it("records a judge's stop as an interruption, which is neither a dash nor a nought", () => {
      // A stop on two serious faults is not a hylkäävä virhe, so it does not take the dash every
      // elimination takes — and the dog was not judged and unplaced either, so it is not a nought.
      expect(deriveNowtResult({ retirement: { cause: 'judgeStopped' }, tasks: round(17, null, null, null) })).toBe(
        'KES'
      )
    })
  })
})

describe('eliminatingFaults', () => {
  it('offers merkkaaminen only where the NOU rules give it', () => {
    // §2.3.2 fails the Hakuinto quality of the taipumuskoe for continual scent-marking. NOWT §5.3.5 has
    // four faults and this is not among them, so offering it there would invite a record the rules of
    // that trial cannot account for.
    expect(eliminatingFaults('NOU')).toContain('marking')
    expect(eliminatingFaults('NOWT')).not.toContain('marking')
    expect(eliminatingFaults('NOME-B')).not.toContain('marking')
    expect(eliminatingFaults()).not.toContain('marking')
  })

  it('offers the shared vocabulary to every event type', () => {
    for (const eventType of ['NOU', 'NOME-A', 'NOME-B', 'NOWT', 'NKM', undefined]) {
      expect(eliminatingFaults(eventType)).toEqual(
        expect.arrayContaining(['aggression', 'gunShyness', 'refusedRetrieve', 'hardMouth', 'harshHandling'])
      )
    }
  })
})

describe('taskMaxPoints', () => {
  it('gives a lone task the whole post', () => {
    expect(taskMaxPoints(1)).toBe(20)
  })

  it('splits a post evenly between two tasks, so the parts cannot fail to add up', () => {
    expect(taskMaxPoints(2) * 2).toBe(taskMaxPoints(1))
    expect(taskMaxPoints(2)).toBe(10)
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

describe('classRound', () => {
  it('expands each post into its own slots, in course order', () => {
    expect(
      classRound([
        { id: 'post-1', tasks: 2 },
        { id: 'post-2', tasks: 1 },
      ])
    ).toEqual([
      { index: 0, maxPoints: 10, stationId: 'post-1' },
      { index: 1, maxPoints: 10, stationId: 'post-1' },
      { index: 0, maxPoints: 20, stationId: 'post-2' },
    ])
  })

  it('lets one class split a post differently from the course as built', () => {
    const stations = [{ id: 'post-1', tasks: 1 as const }]

    expect(classRound(stations, [{ stationId: 'post-1', tasks: 2 }])).toEqual([
      { index: 0, maxPoints: 10, stationId: 'post-1' },
      { index: 1, maxPoints: 10, stationId: 'post-1' },
    ])
  })

  it('follows the post where the class has no entry of its own', () => {
    const stations = [{ id: 'post-1', tasks: 2 as const }]

    expect(classRound(stations, [{ stationId: 'other', tasks: 1 }])).toEqual(classRound(stations))
  })

  it('always adds up to the posts it came from, however they are split', () => {
    const stations = [
      { id: 'post-1', tasks: 2 as const },
      { id: 'post-2', tasks: 1 as const },
      { id: 'post-3', tasks: 2 as const },
      { id: 'post-4', tasks: 1 as const },
    ]

    expect(nowtTotals(toScoredTasks(classRound(stations), [])).maxPoints).toBe(80)
  })
})

describe('toScoredTasks', () => {
  const round = classRound([
    { id: 'post-1', tasks: 2 },
    { id: 'post-2', tasks: 1 },
  ])

  const scored = (stationId: string, index: number, points: number | null): JsonEventResultTask => ({
    index,
    points,
    stationId,
    updatedAt: '2026-08-29T10:00:00.000Z',
    updatedBy: 'secretary',
  })

  it('joins entries onto the round', () => {
    expect(toScoredTasks(round, [scored('post-1', 0, 9), scored('post-1', 1, 8), scored('post-2', 0, 18)])).toEqual([
      { maxPoints: 10, points: 9, stationId: 'post-1' },
      { maxPoints: 10, points: 8, stationId: 'post-1' },
      { maxPoints: 20, points: 18, stationId: 'post-2' },
    ])
  })

  it('tells the two tasks of one post apart', () => {
    const result = toScoredTasks(round, [scored('post-1', 1, 8)])

    expect(result.map((item) => item.points)).toEqual([null, 8, null])
  })

  it('reads a task with no entry as unscored instead of dropping it from the maximum', () => {
    const result = toScoredTasks(round, [scored('post-1', 0, 9)])

    expect(result.map((item) => item.points)).toEqual([9, null, null])
    expect(nowtTotals(result).maxPoints).toBe(40)
  })

  it('ignores entries for posts the round no longer holds', () => {
    expect(toScoredTasks(classRound([{ id: 'post-1', tasks: 1 }]), [scored('removed', 0, 20)])).toEqual([
      { maxPoints: 20, points: null, stationId: 'post-1' },
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

  it('offers the interruption only where a judge may stop a dog short of an eliminating fault', () => {
    expect(availableResultCodes('NOME-A')).toEqual(['1', '2', '3', '0', '-', 'KES'])
    expect(availableResultCodes('NOME-A SM')).toEqual(['1', '2', '3', '0', '-', 'KES'])
    expect(availableResultCodes('NOWT')).not.toContain('KES')
  })
})

describe('parseEventResultCode', () => {
  it('reads the code back out of a stored result', () => {
    expect(parseEventResultCode('NOU1', 'NOU')).toBe('1')
    expect(parseEventResultCode('ALO2', 'NOWT', 'ALO')).toBe('2')
    expect(parseEventResultCode('AVO-', 'NOWT', 'AVO')).toBe('-')
  })

  it('reads the interruption back, and only for a type that awards it', () => {
    expect(parseEventResultCode('AVOKES', 'NOME-A', 'AVO')).toBe('KES')
    expect(parseEventResultCode('AVOKES', 'NOWT', 'AVO')).toBeUndefined()
  })

  it('refuses a foreign prefix and a code the type cannot award', () => {
    // Whatever wrote NOU2 was not using a pass/fail test's alphabet, so it is not this view's to read.
    expect(parseEventResultCode('NOU2', 'NOU')).toBeUndefined()
    expect(parseEventResultCode('AVO1', 'NOWT', 'ALO')).toBeUndefined()
    expect(parseEventResultCode(undefined, 'NOU')).toBeUndefined()
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

describe('resolveEventResult', () => {
  const nowt = {
    eventClass: 'AVO',
    eventType: 'NOWT',
    stations: [
      { id: 'post-1', tasks: 1 as const },
      { id: 'post-2', tasks: 1 as const },
      { id: 'post-3', tasks: 1 as const },
      { id: 'post-4', tasks: 1 as const },
    ],
  }

  const entered = (stationId: string, points: number | null): JsonEventResultTask => ({
    index: 0,
    points,
    stationId,
    updatedAt: '2026-08-29T10:00:00.000Z',
    updatedBy: 'secretary',
  })

  const fullRound = (...points: number[]) => points.map((value, index) => entered(`post-${index + 1}`, value))

  it('derives the totals and composes the result', () => {
    expect(resolveEventResult({ tasks: fullRound(17, 18, 16, 14) }, nowt)).toMatchObject({
      maxPoints: 80,
      percentage: 81.25,
      points: 65,
      result: 'AVO1',
    })
  })

  it('ignores a total the client tried to supply', () => {
    const result = resolveEventResult(
      // A client claiming a perfect round must not be believed over its own task scores.
      { points: 80, tasks: fullRound(10, 10, 10, 10) } as SubmittedEventResult,
      nowt
    )

    expect(result.points).toBe(40)
    expect(result.result).toBe('AVO3')
  })

  it('lets a submitted code override the derived prize', () => {
    // §5.4.1 grants no discretion here and no client sends this; the server-side override stands until
    // the deferred conformance work decides whether it should exist at all.
    expect(resolveEventResult({ resultCode: '2', tasks: fullRound(17, 18, 16, 14) }, nowt).result).toBe('AVO2')
  })

  it('publishes no percentage for a voided round', () => {
    const result = resolveEventResult({ elimination: { fault: 'hardMouth' }, tasks: [entered('post-1', 17)] }, nowt)

    expect(result.result).toBe('AVO-')
    expect(result.percentage).toBeUndefined()
    expect(result.points).toBeUndefined()
  })

  it('leaves the result open while the round is half entered', () => {
    const result = resolveEventResult({ tasks: fullRound(17, 18) }, nowt)

    expect(result.result).toBeUndefined()
    // The running total is still worth showing, even before a prize can be decided.
    expect(result.points).toBe(35)
  })

  it('takes a qualitative type at its word and derives nothing', () => {
    const result = resolveEventResult({ resultCode: '1' }, { eventClass: 'ALO', eventType: 'NOME-B' })

    expect(result).toEqual({ result: 'ALO1' })
  })

  it('composes a classless type from its event type', () => {
    expect(resolveEventResult({ resultCode: '0' }, { eventType: 'NOU' }).result).toBe('NOU0')
  })

  it('publishes a stopped trial as the interruption without being told the code as well', () => {
    const result = resolveEventResult(
      { retirement: { cause: 'judgeStopped', stationId: 'post-1' } },
      { eventClass: 'AVO', eventType: 'NOME-A' }
    )

    expect(result).toEqual({ result: 'AVOKES', retirement: { cause: 'judgeStopped', stationId: 'post-1' } })
  })

  it('still lets the secretary say otherwise about a stopped trial', () => {
    const result = resolveEventResult(
      { resultCode: '-', retirement: { cause: 'judgeStopped' } },
      { eventClass: 'AVO', eventType: 'NOME-A' }
    )

    expect(result.result).toBe('AVO-')
  })

  it('honours a class that splits a post differently from the course', () => {
    const result = resolveEventResult(
      { tasks: [entered('post-1', 9), { ...entered('post-1', 8), index: 1 }] },
      {
        classStations: [{ stationId: 'post-1', tasks: 2 }],
        eventClass: 'ALO',
        eventType: 'NOWT',
        stations: [{ id: 'post-1', tasks: 1 }],
      }
    )

    expect(result).toMatchObject({ maxPoints: 20, points: 17 })
  })
})

describe('sameEventResult', () => {
  const result = (updatedAt: string, updatedBy: string): JsonEventResult => ({
    points: 65,
    result: 'AVO1',
    updatedAt,
    updatedBy,
  })

  it('ignores who wrote it down and when', () => {
    // A retry landing after the first attempt succeeded is the same result, not a competing one.
    expect(sameEventResult(result('2026-09-12T10:00:00.000Z', 'a'), result('2026-09-12T11:00:00.000Z', 'b'))).toBe(true)
  })

  it('sees a different outcome', () => {
    expect(sameEventResult(result('x', 'a'), { ...result('x', 'a'), result: 'AVO2' })).toBe(false)
  })

  it('treats a missing result as different from any result', () => {
    expect(sameEventResult(undefined, result('x', 'a'))).toBe(false)
    expect(sameEventResult(undefined, undefined)).toBe(true)
  })
})

describe('per-post entry', () => {
  const at = (stationId: string, index: number, points: number, updatedAt: string): JsonEventResultTask => ({
    index,
    points,
    stationId,
    updatedAt,
    updatedBy: 'joku',
  })

  const stored = [at('post-1', 0, 17, '2026-09-12T10:00:00.000Z'), at('post-2', 0, 18, '2026-09-12T11:00:00.000Z')]

  describe('mergeStationTasks', () => {
    it('replaces one post and leaves the rest of the round alone', () => {
      const merged = mergeStationTasks(stored, [at('post-1', 0, 12, '2026-09-12T12:00:00.000Z')], 'post-1')

      expect(merged).toEqual([
        at('post-2', 0, 18, '2026-09-12T11:00:00.000Z'),
        at('post-1', 0, 12, '2026-09-12T12:00:00.000Z'),
      ])
    })

    it('drops tasks submitted for a post the submission does not cover', () => {
      // A post may only speak for itself, however the client filled the payload.
      const merged = mergeStationTasks(stored, [at('post-2', 0, 1, 'x'), at('post-3', 0, 20, 'x')], 'post-3')

      expect(merged.map((task) => [task.stationId, task.points])).toEqual([
        ['post-1', 17],
        ['post-2', 18],
        ['post-3', 20],
      ])
    })

    it('adds a post that had nothing stored yet', () => {
      expect(mergeStationTasks(undefined, [at('post-1', 0, 17, 'x')], 'post-1')).toHaveLength(1)
    })
  })

  describe('stationVersion', () => {
    it("reports the latest write among that post's tasks", () => {
      const twoTasks = [at('post-1', 0, 9, '2026-09-12T10:00:00.000Z'), at('post-1', 1, 8, '2026-09-12T12:00:00.000Z')]

      expect(stationVersion(twoTasks, 'post-1')).toBe('2026-09-12T12:00:00.000Z')
    })

    it('is unaware of other posts, so their saves cannot make this one look stale', () => {
      expect(stationVersion(stored, 'post-1')).toBe('2026-09-12T10:00:00.000Z')
    })

    it('has no version for a post nothing has scored', () => {
      expect(stationVersion(stored, 'post-9')).toBeUndefined()
    })
  })

  describe('sameStationTasks', () => {
    it('ignores who recorded a score and when', () => {
      expect(sameStationTasks(stored, [at('post-1', 0, 17, 'much later')], 'post-1')).toBe(true)
    })

    it('sees a different score', () => {
      expect(sameStationTasks(stored, [at('post-1', 0, 12, 'x')], 'post-1')).toBe(false)
    })

    it('compares only the post in question', () => {
      // Post 2 differs wildly, but this is a post 1 submission.
      expect(sameStationTasks(stored, [at('post-1', 0, 17, 'x'), at('post-2', 0, 0, 'x')], 'post-1')).toBe(true)
    })
  })
})
