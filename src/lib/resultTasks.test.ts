import type { EventExercise, EventRotationGroup, JsonEventResultTask } from '../types'
import { nowtTotals } from './results'
import {
  dogRound,
  editVersion,
  effectiveJudge,
  endedAtExercise,
  endedBefore,
  exercisesAtPost,
  heldTasks,
  isRecordedTask,
  isResultTasksDroppedBody,
  mergeStationTasks,
  outcomeDiffers,
  outcomeExercises,
  outcomeHeldElsewhere,
  partMaxPoints,
  rebaseTasks,
  reconcileRoundTasks,
  roundColumns,
  roundsDiffer,
  sameStationTasks,
  stampTasks,
  stationVersion,
  stationWriter,
  toScoredTasks,
  visitSlots,
} from './resultTasks'

/**
 * The slots of `tasks` exercises a group does at one post, numbered after `tasksBefore` exercises
 * elsewhere: a fixture builder over `visitSlots`.
 */
const postSlots = (
  stationId: string,
  { parts, tasks, tasksBefore }: { parts: 1 | 2; tasks: number; tasksBefore: number }
) =>
  Array.from({ length: tasks }, (_unused, at) =>
    visitSlots(stationId, { exercise: tasksBefore + at + 1, parts })
  ).flat()

describe('partMaxPoints', () => {
  it('gives a whole task 20 points', () => {
    expect(partMaxPoints(1)).toBe(20)
  })

  it('splits a task evenly between two parts, so the parts cannot fail to add up', () => {
    expect(partMaxPoints(2) * 2).toBe(partMaxPoints(1))
    expect(partMaxPoints(2)).toBe(10)
  })
})

describe('visitSlots', () => {
  it('gives a whole exercise one slot of 20 at its post', () => {
    expect(visitSlots('post-2', { exercise: 4, parts: 1 })).toEqual([
      { exercise: 4, maxPoints: 20, part: 0, parts: 1, stationId: 'post-2' },
    ])
  })

  it('gives each part of a split exercise a slot of its own', () => {
    expect(visitSlots('post-1', { exercise: 1, parts: 2 })).toEqual([
      { exercise: 1, maxPoints: 10, part: 0, parts: 2, stationId: 'post-1' },
      { exercise: 1, maxPoints: 10, part: 1, parts: 2, stationId: 'post-1' },
    ])
  })
})

describe('roundColumns', () => {
  it('gives every exercise number any round has, in number order, whatever post it was done at', () => {
    const first = postSlots('post-1', { parts: 1, tasks: 1, tasksBefore: 0 })
    const second = [
      ...postSlots('post-2', { parts: 1, tasks: 1, tasksBefore: 0 }),
      ...postSlots('post-1', { parts: 1, tasks: 2, tasksBefore: 1 }),
    ]

    expect(roundColumns([second, first]).map((item) => item.exercise)).toEqual([1, 2, 3])
  })
})

describe('toScoredTasks', () => {
  const round = [
    ...postSlots('post-1', { parts: 2, tasks: 1, tasksBefore: 0 }),
    ...postSlots('post-2', { parts: 1, tasks: 1, tasksBefore: 1 }),
  ]

  const scored = (exercise: number, part: number, points: number | null): JsonEventResultTask => ({
    exercise,
    part,
    points,
    updatedAt: '2026-08-29T10:00:00.000Z',
    updatedBy: 'secretary',
  })

  it('joins entries onto the round by exercise and part', () => {
    expect(toScoredTasks(round, [scored(1, 0, 9), scored(1, 1, 8), scored(2, 0, 18)])).toEqual([
      { maxPoints: 10, points: 9 },
      { maxPoints: 10, points: 8 },
      { maxPoints: 20, points: 18 },
    ])
  })

  it('tells the two parts of one task apart', () => {
    const result = toScoredTasks(round, [scored(1, 1, 8)])

    expect(result.map((item) => item.points)).toEqual([null, 8, null])
  })

  it('reads a task with no entry as unscored instead of dropping it from the maximum', () => {
    const result = toScoredTasks(round, [scored(1, 0, 9)])

    expect(result.map((item) => item.points)).toEqual([9, null, null])
    expect(nowtTotals(result).maxPoints).toBe(40)
  })

  it('ignores entries for exercises the round does not have', () => {
    expect(toScoredTasks(postSlots('post-1', { parts: 1, tasks: 1, tasksBefore: 0 }), [scored(5, 0, 20)])).toEqual([
      { maxPoints: 20, points: null },
    ])
  })
})

describe('per-post entry, by the exercises the group does at the post (KOE-1665)', () => {
  const at = (exercise: number, part: number, points: number, updatedAt: string): JsonEventResultTask => ({
    exercise,
    part,
    points,
    updatedAt,
    updatedBy: 'joku',
  })

  // Exercise 1 at the first post, exercise 2 at the second.
  const stored = [at(1, 0, 17, '2026-09-12T10:00:00.000Z'), at(2, 0, 18, '2026-09-12T11:00:00.000Z')]

  describe('mergeStationTasks', () => {
    it('replaces one post and leaves the rest of the round alone', () => {
      const merged = mergeStationTasks(stored, [at(1, 0, 12, '2026-09-12T12:00:00.000Z')], [1])

      expect(merged).toEqual([at(2, 0, 18, '2026-09-12T11:00:00.000Z'), at(1, 0, 12, '2026-09-12T12:00:00.000Z')])
    })

    it('drops tasks submitted for an exercise the post does not do', () => {
      // A post may only speak for itself, however the client filled the payload.
      const merged = mergeStationTasks(stored, [at(2, 0, 1, 'x'), at(3, 0, 20, 'x')], [3])

      expect(merged.map((task) => [task.exercise, task.points])).toEqual([
        [1, 17],
        [2, 18],
        [3, 20],
      ])
    })

    it('adds a post that had nothing stored yet', () => {
      expect(mergeStationTasks(undefined, [at(1, 0, 17, 'x')], [1])).toHaveLength(1)
    })
  })

  describe('stationWriter', () => {
    const tasks = [
      { exercise: 1, part: 0, updatedAt: '2026-09-12T10:00:00.000Z', updatedBy: 'Sihteeri' },
      { exercise: 1, part: 1, updatedAt: '2026-09-12T12:00:00.000Z', updatedBy: 'Toinen sihteeri' },
      { exercise: 2, part: 0, updatedAt: '2026-09-12T13:00:00.000Z', updatedBy: 'Suorituspaikka 2' },
    ]

    it("names the writer of the task that holds the post's version, not another post's", () => {
      expect(stationWriter(tasks, [1])).toBe('Toinen sihteeri')
    })

    it('names nobody for a post with no scores, or on a link, whose tasks carry no name', () => {
      expect(stationWriter(tasks, [9])).toBeUndefined()
      expect(stationWriter(undefined, [1])).toBeUndefined()
      expect(stationWriter([{ exercise: 1, updatedAt: '2026-09-12T10:00:00.000Z' }], [1])).toBeUndefined()
    })
  })

  describe('editVersion', () => {
    const stored = {
      tasks: [
        { exercise: 1, part: 0, updatedAt: '2026-09-12T10:00:00.000Z' },
        { exercise: 2, part: 0, updatedAt: '2026-09-12T11:00:00.000Z' },
      ],
      updatedAt: '2026-09-12T12:00:00.000Z',
    }

    it("reads the whole result's version with no exercises given", () => {
      expect(editVersion(stored, undefined)).toBe('2026-09-12T12:00:00.000Z')
    })

    it("reads a post's version from its exercises, whatever the other posts did since", () => {
      expect(editVersion(stored, [1])).toBe('2026-09-12T10:00:00.000Z')
    })

    it('reads no version from a post with no exercises, which is not the whole result', () => {
      expect(editVersion(stored, [])).toBeUndefined()
    })

    it("reads a qualitative result's own version, which has no tasks", () => {
      const qualitative = { updatedAt: '2026-09-12T12:00:00.000Z' }

      expect(editVersion(qualitative, undefined)).toBe('2026-09-12T12:00:00.000Z')
      expect(editVersion(undefined, undefined)).toBeUndefined()
    })
  })

  describe('stationVersion', () => {
    it("reports the latest write among that post's tasks", () => {
      const twoParts = [at(1, 0, 9, '2026-09-12T10:00:00.000Z'), at(1, 1, 8, '2026-09-12T12:00:00.000Z')]

      expect(stationVersion(twoParts, [1])).toBe('2026-09-12T12:00:00.000Z')
    })

    it('is unaware of other posts, so their saves cannot make this one look stale', () => {
      expect(stationVersion(stored, [1])).toBe('2026-09-12T10:00:00.000Z')
    })

    it('has no version for a post nothing has scored', () => {
      expect(stationVersion(stored, [9])).toBeUndefined()
    })
  })

  describe('sameStationTasks', () => {
    it('ignores who recorded a score and when', () => {
      expect(sameStationTasks(stored, [at(1, 0, 17, 'much later')], [1])).toBe(true)
    })

    it('sees a different score', () => {
      expect(sameStationTasks(stored, [at(1, 0, 12, 'x')], [1])).toBe(false)
    })

    it('compares the scores of a post doing two exercises whatever order they were saved in', () => {
      const atThird = [at(3, 0, 13, 'x'), at(4, 0, 14, 'x')]

      expect(sameStationTasks(atThird, [at(4, 0, 14, 'y'), at(3, 0, 13, 'y')], [3, 4])).toBe(true)
      expect(sameStationTasks(atThird, [at(4, 0, 13, 'y'), at(3, 0, 14, 'y')], [3, 4])).toBe(false)
    })

    it('compares only the post in question', () => {
      // Exercise 2 differs wildly, but this is a submission of the post doing exercise 1.
      expect(sameStationTasks(stored, [at(1, 0, 17, 'x'), at(2, 0, 0, 'x')], [1])).toBe(true)
    })
  })
})

describe('reconcileRoundTasks (KOE-1666)', () => {
  const whole = postSlots('post-1', { parts: 1, tasks: 2, tasksBefore: 0 })
  const split = postSlots('post-1', { parts: 2, tasks: 1, tasksBefore: 0 })
  const scored = (...addresses: [number, number][]) =>
    addresses.map(([exercise, part]) => ({ exercise, part, points: 8 }))

  it('keeps every score of a round that stays as it was', () => {
    expect(reconcileRoundTasks(whole, whole, scored([1, 0], [2, 0]))).toEqual({
      dropped: [],
      kept: scored([1, 0], [2, 0]),
    })
  })

  it('keeps the scores of the exercises that stay while one is added after them', () => {
    const other = postSlots('post-2', { parts: 1, tasks: 1, tasksBefore: 2 })
    expect(reconcileRoundTasks(whole, [...whole, ...other], scored([1, 0], [2, 0]))).toEqual({
      dropped: [],
      kept: scored([1, 0], [2, 0]),
    })
  })

  it('drops a score whose exercise is now split another way', () => {
    expect(reconcileRoundTasks(whole, split, scored([1, 0], [2, 0]))).toEqual({
      dropped: scored([1, 0], [2, 0]),
      kept: [],
    })
    expect(reconcileRoundTasks(split, whole, scored([1, 0], [1, 1]))).toEqual({
      dropped: scored([1, 0], [1, 1]),
      kept: [],
    })
  })

  it('keeps the scores of a post that gets a second exercise after its first', () => {
    const twoSplit = postSlots('post-1', { parts: 2, tasks: 2, tasksBefore: 0 })
    expect(reconcileRoundTasks(split, twoSplit, scored([1, 0], [1, 1]))).toEqual({
      dropped: [],
      kept: scored([1, 0], [1, 1]),
    })
  })

  it('drops the score of an exercise taken off the end of the order', () => {
    const one = postSlots('post-1', { parts: 1, tasks: 1, tasksBefore: 0 })
    expect(reconcileRoundTasks(whole, one, scored([2, 0]))).toEqual({ dropped: scored([2, 0]), kept: [] })
  })

  it('drops a score the round before did not read either, and has nothing to say of no scores', () => {
    expect(reconcileRoundTasks(split, split, scored([5, 0]))).toEqual({ dropped: scored([5, 0]), kept: [] })
    expect(reconcileRoundTasks(whole, split, undefined)).toEqual({ dropped: [], kept: [] })
  })
})

describe('isRecordedTask (KOE-1666)', () => {
  it.each([
    ['a score', { points: 12 }, true],
    ['a zero', { points: 0 }, true],
    ['an empty field', { points: null }, false],
    ['a zero reason without points', { points: null, zeroFault: 'eyeWipe' as const }, true],
    ['a recall without points', { points: null, recalled: true }, true],
  ])('reads %s as recorded: %s', (_name, task, recorded) => {
    expect(isRecordedTask(task)).toEqual(recorded)
  })
})

describe('endedBefore (KOE-1669)', () => {
  // P3, P1, P3: the dog comes back to post 3, so the post alone would not say which visit the stop was.
  const posts = ['post-3', 'post-1', 'post-3']
  const exercises = [1, 2, 3]

  it('reads the exercises after the one the round ended at as not reached, and not the one it ended at', () => {
    expect(exercises.map((exercise) => endedBefore({ exercise: 3 }, exercise, posts))).toEqual([false, false, false])
    expect(endedAtExercise({ exercise: 3 }, posts)).toBe(3)
    expect(endedBefore({ exercise: 1 }, 2, posts)).toBe(true)
  })

  it.each([
    ['no outcome', undefined],
    ['an unknown place ("Ei tiedossa")', {}],
    ['an exercise the running order no longer has', { exercise: 5 }],
  ])('does not end it for %s', (_name, retirement) => {
    expect(endedAtExercise(retirement, posts)).toBeUndefined()
    expect(endedBefore(retirement, 3, posts)).toBe(false)
  })

  it('keeps the number when the running order changes, as a score keeps its exercise (KOE-1665)', () => {
    const changed = ['post-1', 'post-3', 'post-3']

    expect(endedAtExercise({ exercise: 2 }, changed)).toBe(2)
    expect([1, 2, 3].map((exercise) => endedBefore({ exercise: 2 }, exercise, changed))).toEqual([false, false, true])
  })
})

describe('outcomeHeldElsewhere (KOE-1615)', () => {
  it.each([
    ['no result', undefined, false],
    ['no outcome', {}, false],
    ['a retirement at one of the exercises', { retirement: { exercise: 3 } }, false],
    ['an elimination at one of the exercises', { elimination: { exercise: 1 } }, false],
    ['a retirement at another exercise', { retirement: { exercise: 2 } }, true],
    ['an elimination at another exercise', { elimination: { exercise: 2 } }, true],
    ['a retirement without a place', { retirement: {} }, true],
    ['an elimination without a place', { elimination: {} }, true],
    ['one of two elsewhere', { elimination: { exercise: 1 }, retirement: { exercise: 2 } }, true],
    ['an exercise the round no longer has', { retirement: { exercise: 9 } }, true],
  ])('%s', (_name, result, expected) => {
    expect(outcomeHeldElsewhere(result, [1, 3])).toBe(expected)
  })

  it('holds every outcome elsewhere from a post the dog does not come to', () => {
    expect(outcomeHeldElsewhere({ retirement: { exercise: 1 } }, [])).toBe(true)
  })
})

describe('roundsDiffer (KOE-1666)', () => {
  const first = postSlots('post-1', { parts: 1, tasks: 1, tasksBefore: 0 })
  const second = postSlots('post-2', { parts: 1, tasks: 1, tasksBefore: 1 })

  it('reads the same slots in another order as the same round', () => {
    expect(roundsDiffer([...first, ...second], [...second, ...first])).toEqual(false)
  })

  it('reads an exercise done at another post as the same round, the score staying with its exercise (KOE-1665)', () => {
    expect(roundsDiffer(first, postSlots('post-2', { parts: 1, tasks: 1, tasksBefore: 0 }))).toEqual(false)
  })

  it.each([
    ['an exercise more', [...first, ...second]],
    ['a split exercise', postSlots('post-1', { parts: 2, tasks: 1, tasksBefore: 0 }).slice(0, 1)],
    ['another exercise number', second],
  ])('reads %s as a different round', (_name, after) => {
    expect(roundsDiffer(first, after)).toEqual(true)
  })
})

describe('isResultTasksDroppedBody (KOE-1666)', () => {
  const body = { confirmation: 'abc', dogs: [{ id: 'r1', name: 'Hukka', tasks: 1 }], error: 'resultTasksDropped' }

  it('reads the question the event save asks about dropped scores', () => {
    expect(isResultTasksDroppedBody(body)).toEqual(true)
  })

  it.each([
    ['another error', { ...body, error: 'staleData' }],
    ['no confirmation', { ...body, confirmation: undefined }],
    ['a dog without a count', { ...body, dogs: [{ id: 'r1', name: 'Hukka' }] }],
    ['no body', undefined],
  ])('refuses %s', (_name, value) => {
    expect(isResultTasksDroppedBody(value)).toEqual(false)
  })
})

describe('scores addressed by exercise (KOE-1665, Jukka 2.11.2026)', () => {
  const day = '2026-09-12' as const
  const dog = { class: 'ALO', day }
  /** Posts 1..n of the day. */
  const stations = (count: number) =>
    Array.from({ length: count }, (_unused, at) => ({ date: day, id: `P${at + 1}`, number: at + 1 }))
  const ordered = (...exercises: EventExercise[]): EventRotationGroup[] => [{ class: 'ALO', exercises }]
  const scored = (exercise: number, points = 15, part = 0) => ({
    exercise,
    part,
    points,
    updatedAt: '2026-09-12T10:00:00.000Z',
    updatedBy: 'Sihteeri',
  })
  // Four old-style posts, one exercise each, in number order: the layout every production trial has.
  const fourPosts = { stations: stations(4) }
  // The truth: three posts, the third doing exercises 3 and 4.
  const threePosts = {
    rotations: ordered({ stationId: 'P1' }, { stationId: 'P2' }, { stationId: 'P3' }, { stationId: 'P3' }),
    stations: stations(3),
  }

  describe('reconcileRoundTasks', () => {
    it('keeps every score when four posts are corrected to the three the trial had, and the rounds read the same', () => {
      const before = dogRound(fourPosts, dog)
      const after = dogRound(threePosts, dog)
      const stored = [scored(1, 11), scored(2, 12), scored(3, 13), scored(4, 14)]

      expect(roundsDiffer(before, after)).toBe(false)
      expect(reconcileRoundTasks(before, after, stored)).toEqual({ dropped: [], kept: stored })
    })

    it('drops the scores of an exercise taken off the end of the running order', () => {
      const after = dogRound(
        { ...threePosts, rotations: ordered({ stationId: 'P1' }, { stationId: 'P2' }, { stationId: 'P3' }) },
        dog
      )
      const stored = [scored(1), scored(2), scored(3), scored(4, 14)]

      expect(roundsDiffer(dogRound(threePosts, dog), after)).toBe(true)
      expect(reconcileRoundTasks(dogRound(threePosts, dog), after, stored)).toEqual({
        dropped: [scored(4, 14)],
        kept: [scored(1), scored(2), scored(3)],
      })
    })

    it('drops the scores of an exercise now split another way, whole to parts and parts to whole', () => {
      const split = dogRound(
        {
          ...threePosts,
          rotations: ordered(
            { stationId: 'P1' },
            { parts: 2, stationId: 'P2' },
            { stationId: 'P3' },
            { stationId: 'P3' }
          ),
        },
        dog
      )
      const whole = dogRound(threePosts, dog)

      expect(roundsDiffer(whole, split)).toBe(true)
      expect(reconcileRoundTasks(whole, split, [scored(1), scored(2, 16)])).toEqual({
        dropped: [scored(2, 16)],
        kept: [scored(1)],
      })
      expect(reconcileRoundTasks(split, whole, [scored(2, 8, 0), scored(2, 9, 1)])).toEqual({
        dropped: [scored(2, 8, 0), scored(2, 9, 1)],
        kept: [],
      })
    })

    it('reads a new order of the same posts as no difference, the scores staying with their exercise', () => {
      const reordered = dogRound(
        {
          ...threePosts,
          rotations: ordered({ stationId: 'P3' }, { stationId: 'P3' }, { stationId: 'P1' }, { stationId: 'P2' }),
        },
        dog
      )
      expect(roundsDiffer(dogRound(threePosts, dog), reordered)).toBe(false)
    })
  })

  describe('exercisesAtPost', () => {
    it('names the exercises a group does at a post, from its posts in exercise order', () => {
      expect(exercisesAtPost(['P1', 'P2', 'P3', 'P3'], 'P3')).toEqual([3, 4])
      expect(exercisesAtPost(['P1', 'P2', 'P3', 'P3'], 'P4')).toEqual([])
    })
  })

  describe('a post scoped by its exercises', () => {
    const atThird = [3, 4]

    it("replaces the post's exercises and leaves the others as stored", () => {
      const stored = [scored(1, 11), scored(3, 13), scored(4, 14)]
      const submitted = [scored(3, 17), scored(4, 18)]

      expect(mergeStationTasks(stored, submitted, atThird)).toEqual([scored(1, 11), scored(3, 17), scored(4, 18)])
    })

    it("versions the post by its exercises' latest write", () => {
      const stored = [{ ...scored(1), updatedAt: '2026-09-12T12:00:00.000Z' }, scored(4)]
      expect(stationVersion(stored, atThird)).toEqual('2026-09-12T10:00:00.000Z')
      expect(sameStationTasks(stored, [scored(4)], atThird)).toBe(true)
    })
  })

  describe('heldTasks', () => {
    const judge = { id: 1, name: 'A' }
    const stored = { exercise: 2, judge, part: 0, points: 15, updatedAt: '2026-09-12T10:00:00.000Z', updatedBy: 'B' }
    const typed = { exercise: 2, judge, part: 0, points: 15 }
    const atFirst = [1]

    it("leaves out the post's own exercises, whatever they say", () => {
      expect(heldTasks([{ ...typed, exercise: 1, points: 3 }], [], atFirst)).toEqual([])
    })

    it('holds a score at another exercise that nothing is stored for', () => {
      expect(heldTasks([typed], [], atFirst)).toEqual([typed])
      expect(heldTasks([typed], undefined, atFirst)).toEqual([typed])
      // Recorded without points: null is still no match for the nothing stored.
      const recalled = { exercise: 2, part: 0, points: null, recalled: true }
      expect(heldTasks([recalled], [], atFirst)).toEqual([recalled])
    })

    it('holds a score that differs from the stored one at its address', () => {
      expect(heldTasks([{ ...typed, points: 16 }], [stored], atFirst)).toEqual([{ ...typed, points: 16 }])
      expect(heldTasks([{ ...typed, part: 1 }], [stored], atFirst)).toEqual([{ ...typed, part: 1 }])
    })

    it('reads who recorded a score and when as no difference', () => {
      expect(heldTasks([typed], [stored], atFirst)).toEqual([])
    })

    it('reads a field written empty as no difference', () => {
      expect(heldTasks([{ ...typed, recalled: false, zeroFault: undefined }], [stored], atFirst)).toEqual([])
    })

    it('holds another reason for a zero, a recall and another judge', () => {
      const zero = { ...typed, points: 0, zeroFault: 'failedRetrieve' as const }
      expect(heldTasks([zero], [{ ...stored, points: 0, zeroFault: 'unauthorizedRun' as const }], atFirst)).toEqual([
        zero,
      ])
      expect(heldTasks([{ ...typed, recalled: true }], [stored], atFirst)).toEqual([{ ...typed, recalled: true }])
      const other = { ...typed, judge: { id: 2, name: 'B' } }
      expect(heldTasks([other], [stored], atFirst)).toEqual([other])
    })

    it('tells a judge without an id by name, and the same judge by id whatever the rest of the object', () => {
      const named = { ...typed, judge: { name: 'A' } }
      expect(heldTasks([named], [{ ...stored, judge: { name: 'A' } }], atFirst)).toEqual([])
      expect(heldTasks([named], [{ ...stored, judge: { name: 'C' } }], atFirst)).toEqual([named])
      expect(heldTasks([{ ...typed, judge: { id: 1, name: 'A.' } }], [stored], atFirst)).toEqual([])
    })

    it('reads a blank as nothing, but holds a stored score cleared', () => {
      const blank = { exercise: 2, part: 0, points: null }
      expect(heldTasks([blank], [], atFirst)).toEqual([])
      expect(heldTasks([blank], [{ ...stored, points: null }], atFirst)).toEqual([])
      expect(heldTasks([blank], [stored], atFirst)).toEqual([blank])
    })

    it('holds everything recorded where the post has none of the exercises', () => {
      expect(heldTasks([typed], [], [])).toEqual([typed])
    })

    it('says nothing of a stored score the edit does not hold', () => {
      expect(heldTasks([], [stored], atFirst)).toEqual([])
    })
  })

  describe('effectiveJudge', () => {
    const a = { id: 1, name: 'A' }
    const b = { id: 2, name: 'B' }
    const c = { id: 3, name: 'C' }

    it("takes the stored judge where it is one of the post's judges", () => {
      expect(effectiveJudge({ judge: b }, [a, b])).toEqual(b)
    })

    it("takes the post's first judge where the exercise's post changed since", () => {
      expect(effectiveJudge({ judge: c }, [a, b])).toEqual(a)
      expect(effectiveJudge({}, [a, b])).toEqual(a)
    })

    it('keeps the stored judge where the post names none', () => {
      expect(effectiveJudge({ judge: c }, [])).toEqual(c)
    })
  })
})

describe('outcomeDiffers', () => {
  const injury = { cause: 'injury' as const, exercise: 1 }

  it('reads nothing and nothing as the same, an undefined field or none', () => {
    expect(outcomeDiffers(undefined, { retirement: undefined })).toBe(false)
  })

  it('reads an outcome against none, and another outcome, as a difference', () => {
    expect(outcomeDiffers({ retirement: injury }, undefined)).toBe(true)
    expect(outcomeDiffers({ retirement: injury }, { retirement: { ...injury, exercise: 2 } })).toBe(true)
  })

  it('reads the same outcome as the same', () => {
    expect(outcomeDiffers({ retirement: injury }, { retirement: { ...injury } })).toBe(false)
  })
})

describe('outcomeExercises', () => {
  const posts = ['post-2', 'post-1', 'post-1']
  const at = (exercise?: number) => ({ retirement: { cause: 'injury' as const, ...(exercise ? { exercise } : {}) } })

  it('names nothing where the outcome did not change', () => {
    expect(outcomeExercises(at(2), at(2), posts)).toEqual([])
  })

  it('names every exercise of the post the new outcome is at', () => {
    expect(outcomeExercises(undefined, at(2), posts)).toEqual([2, 3])
  })

  it('names the post of a cleared outcome', () => {
    expect(outcomeExercises(at(1), {}, posts)).toEqual([1])
  })

  it('names both posts of a moved outcome', () => {
    expect(outcomeExercises(at(1), at(3), posts)).toEqual([1, 2, 3])
  })

  it('names no post for an outcome without a place', () => {
    expect(outcomeExercises(undefined, at(), posts)).toEqual([])
  })

  it('names no post for an exercise the round no longer has', () => {
    expect(outcomeExercises(undefined, at(9), posts)).toEqual([])
  })

  it('names nothing in a round without posts', () => {
    expect(outcomeExercises(undefined, at(1), [])).toEqual([])
  })
})

describe('stampTasks', () => {
  const stamp = { updatedAt: 'now', updatedBy: 'Sihteeri' }
  const stored: JsonEventResultTask[] = [{ exercise: 1, part: 0, points: 15, updatedAt: 'then', updatedBy: 'Rasti' }]

  it('keeps the stored stamp on a task saying the same', () => {
    expect(stampTasks([{ exercise: 1, part: 0, points: 15 }], stored, [], stamp)).toEqual(stored)
  })

  it('stamps a task saying something else', () => {
    expect(stampTasks([{ exercise: 1, part: 0, points: 18 }], stored, [], stamp)).toEqual([
      { exercise: 1, part: 0, points: 18, ...stamp },
    ])
  })

  it('stamps a task with nothing stored at its address, also with nothing stored at all', () => {
    expect(stampTasks([{ exercise: 2, part: 0, points: 8 }], stored, [], stamp)[0]).toMatchObject(stamp)
    expect(stampTasks([{ exercise: 2, part: 0, points: 8 }], undefined, [], stamp)[0]).toMatchObject(stamp)
  })

  it('stamps a task of a renewed exercise that says the same', () => {
    expect(stampTasks([{ exercise: 1, part: 0, points: 15 }], stored, [1], stamp)[0]).toMatchObject(stamp)
  })

  it('stamps a recall added alone', () => {
    expect(stampTasks([{ exercise: 1, part: 0, points: 15, recalled: true }], stored, [], stamp)[0]).toMatchObject(
      stamp
    )
  })

  it('stamps each part of an exercise by its own content', () => {
    const parts: JsonEventResultTask[] = [
      { exercise: 1, part: 0, points: 8, updatedAt: 'then', updatedBy: 'Rasti' },
      { exercise: 1, part: 1, points: 7, updatedAt: 'then', updatedBy: 'Rasti' },
    ]
    const [first, second] = stampTasks(
      [
        { exercise: 1, part: 0, points: 8 },
        { exercise: 1, part: 1, points: 6 },
      ],
      parts,
      [],
      stamp
    )

    expect(first).toMatchObject({ updatedAt: 'then', updatedBy: 'Rasti' })
    expect(second).toMatchObject(stamp)
  })
})

describe('rebaseTasks', () => {
  const task = (exercise: number, points: number | null, part = 0) => ({ exercise, part, points })

  it('takes the stored task where the edit is as it started, and keeps the edit elsewhere', () => {
    expect(rebaseTasks([task(1, 15), task(2, 12)], [task(1, 15), task(2, 9)], [task(1, 18), task(2, 12)])).toEqual({
      collided: [],
      tasks: [task(1, 18), task(2, 9)],
    })
  })

  it('tells the parts of an exercise apart, and names the exercise once', () => {
    const { collided } = rebaseTasks(
      [task(1, 8), task(1, 7, 1)],
      [task(1, 9), task(1, 6, 1)],
      [task(1, 5), task(1, 4, 1)]
    )

    expect(collided).toEqual([1])
  })

  it('reads a blank as nothing, against nothing stored and against a stored blank', () => {
    expect(rebaseTasks([], [task(1, null)], []).tasks).toEqual([])
    expect(rebaseTasks([task(1, null)], [task(1, null)], [task(1, 4)]).tasks).toEqual([task(1, 4)])
  })

  it('reads a clearing as the secretary’s change', () => {
    const { collided, tasks } = rebaseTasks([task(1, 15)], [task(1, null)], [task(1, 18)])

    expect(tasks).toEqual([task(1, null)])
    expect(collided).toEqual([1])
  })

  it('reads a judge changed alone as the secretary’s change', () => {
    const judged = { ...task(1, 15), judge: { id: 1, name: 'Tuomari' } }

    expect(rebaseTasks([task(1, 15)], [judged], [task(1, 18)]).collided).toEqual([1])
  })

  it('leaves out a task the edit does not hold where it started without it and nothing is stored', () => {
    expect(rebaseTasks([task(1, 15)], [task(1, 15)], []).tasks).toEqual([])
  })
})
