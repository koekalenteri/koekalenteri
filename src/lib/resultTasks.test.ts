import type { EventExercise, EventRotationGroup, EventStation, JsonEventResultTask } from '../types'
import type { ScoredTask } from './resultTasks'
import { nowtTotals } from './results'
import {
  addressTasks,
  dogRound,
  effectiveJudge,
  endedAtExercise,
  endedBefore,
  exercisesAtPost,
  exerciseTaskOf,
  isRecordedTask,
  isResultTasksDroppedBody,
  legacyReadChanges,
  mergeStationTasks,
  partMaxPoints,
  reconcileRoundTasks,
  roundColumns,
  roundsDiffer,
  sameStationTasks,
  stationVersion,
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
    visitSlots(stationId, { exercise: tasksBefore + at + 1, parts, slotsBefore: at * parts })
  ).flat()

/** One task at its own post, the common layout. */
const task = (stationId: string, points: number | null, maxPoints = 20): ScoredTask => ({
  maxPoints,
  points,
  stationId,
})

/** A four-post round, one task each, scored as given. */
const _round = (...points: (number | null)[]): ScoredTask[] =>
  points.map((value, index) => task(`post-${index + 1}`, value))

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
  it('places an exercise after the slots the group takes at the post before it, as scores stored by post read it', () => {
    expect(visitSlots('post-2', { exercise: 4, parts: 1, slotsBefore: 1 })).toEqual([
      { exercise: 4, legacyIndex: 1, maxPoints: 20, part: 0, parts: 1, stationId: 'post-2' },
    ])
  })

  it('gives each part of a split exercise a slot of its own', () => {
    expect(visitSlots('post-1', { exercise: 1, parts: 2, slotsBefore: 0 })).toEqual([
      { exercise: 1, legacyIndex: 0, maxPoints: 10, part: 0, parts: 2, stationId: 'post-1' },
      { exercise: 1, legacyIndex: 1, maxPoints: 10, part: 1, parts: 2, stationId: 'post-1' },
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
      { maxPoints: 10, points: 9, stationId: 'post-1', task: 1 },
      { maxPoints: 10, points: 8, stationId: 'post-1', task: 1 },
      { maxPoints: 20, points: 18, stationId: 'post-2', task: 2 },
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
      { maxPoints: 20, points: null, stationId: 'post-1', task: 1 },
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
    ['a zero reason without points', { points: null, zeroFault: 'unknown' as const }, true],
    ['a recall without points', { points: null, recalled: true }, true],
  ])('reads %s as recorded: %s', (_name, task, recorded) => {
    expect(isRecordedTask(task)).toEqual(recorded)
  })
})

describe('endedBefore (KOE-1669)', () => {
  // P3, P1, P3: the dog comes back to post 3, so the post alone does not say which visit the stop was.
  const posts = ['post-3', 'post-1', 'post-3']
  const exercises = [1, 2, 3]

  it('reads the exercises after the one the round ended at as not reached, and not the one it ended at', () => {
    const stoppedAtThird = { exercise: 3, stationId: 'post-3' }

    expect(exercises.map((exercise) => endedBefore(stoppedAtThird, exercise, posts))).toEqual([false, false, false])
    expect(endedAtExercise(stoppedAtThird, posts)).toBe(3)
    expect(endedBefore({ exercise: 1, stationId: 'post-3' }, 2, posts)).toBe(true)
  })

  it('reads a stop stored with its post alone, before the exercises were numbered, as the last exercise there', () => {
    expect(endedAtExercise({ stationId: 'post-3' }, posts)).toBe(3)
    expect(exercises.map((exercise) => endedBefore({ stationId: 'post-3' }, exercise, posts))).toEqual([
      false,
      false,
      false,
    ])
    expect(endedAtExercise({ stationId: 'post-1' }, posts)).toBe(2)
  })

  it.each([
    ['no outcome', undefined],
    ['an unknown place ("Ei tiedossa")', {}],
    ['a post not in the running order', { stationId: 'post-9' }],
  ])('does not end it for %s', (_name, retirement) => {
    expect(endedAtExercise(retirement, posts)).toBeUndefined()
    expect(endedBefore(retirement, 3, posts)).toBe(false)
  })

  // A stop stays with its exercise number, as a score does (KOE-1665): a post stored beside it is read
  // only where the number is not in the round.
  describe('after the running order changed', () => {
    it('reads the post when the exercise the number named was removed', () => {
      // Stored as the third exercise of P3, P1, P3; the first exercise is then removed.
      const stopped = { exercise: 3, stationId: 'post-3' }
      const changed = ['post-1', 'post-3']

      expect(endedAtExercise(stopped, changed)).toBe(2)
      expect([1, 2].map((exercise) => endedBefore(stopped, exercise, changed))).toEqual([false, false])
    })

    it('reads the post when the number is past the end of the running order', () => {
      expect(endedAtExercise({ exercise: 5, stationId: 'post-1' }, posts)).toBe(2)
      expect(endedAtExercise({ exercise: 5 }, posts)).toBeUndefined()
    })

    it('keeps the number when the post stored beside it has left the running order', () => {
      expect(endedAtExercise({ exercise: 2, stationId: 'post-1' }, ['post-3', 'post-3'])).toBe(2)
    })

    it('keeps the number when it still names an exercise at its post', () => {
      const stopped = { exercise: 1, stationId: 'post-3' }
      const changed = ['post-3', 'post-3', 'post-1']

      expect(endedAtExercise(stopped, changed)).toBe(1)
      expect([1, 2, 3].map((exercise) => endedBefore(stopped, exercise, changed))).toEqual([false, true, true])
    })

    it('keeps the number when it now names another post', () => {
      // Stored at P1, the second exercise of P3, P1, P3; read against P1, P3, P3.
      const stopped = { exercise: 2, stationId: 'post-1' }
      const changed = ['post-1', 'post-3', 'post-3']

      expect(endedAtExercise(stopped, changed)).toBe(2)
      expect([1, 2, 3].map((exercise) => endedBefore(stopped, exercise, changed))).toEqual([false, false, true])
    })
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

describe('a score stored by post and slot (KOE-1665)', () => {
  const DAY = '2026-09-12' as const
  const post = (number: number, extra: Partial<EventStation> = {}): EventStation => ({
    date: DAY,
    id: `post-${number}`,
    number,
    ...extra,
  })
  const stations = [post(1, { tasks: 2 }), post(2)]
  const round = dogRound({ stations }, { class: 'ALO', day: DAY })

  it('reads a score stored by post and slot, as production holds them, as its exercise and part', () => {
    const stored = [
      { index: 1, points: 8, stationId: 'post-1' },
      { index: 0, points: 15, stationId: 'post-2' },
    ]

    expect(toScoredTasks(round, addressTasks(round, stored).kept).map((task) => task.points)).toEqual([null, 8, 15])
  })
})

describe('scores addressed by exercise (KOE-1665, Jukka 2.11.2026)', () => {
  const day = '2026-09-12' as const
  const dog = { class: 'ALO', day }
  /** Posts 1..n of the day, one of them stored before KOE-1665 with `tasks: 2` where asked. */
  const stations = (count: number, legacySplit?: string) =>
    Array.from({ length: count }, (_unused, at) => ({
      date: day,
      id: `P${at + 1}`,
      number: at + 1,
      ...(legacySplit === `P${at + 1}` ? { tasks: 2 as const } : {}),
    }))
  const ordered = (...exercises: EventExercise[]): EventRotationGroup[] => [{ class: 'ALO', exercises }]
  const scored = (exercise: number, points = 15, part = 0) => ({
    exercise,
    part,
    points,
    updatedAt: '2026-09-12T10:00:00.000Z',
    updatedBy: 'Sihteeri',
  })
  const legacy = (stationId: string, index: number, points = 15) => ({
    index,
    points,
    stationId,
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

  describe('exerciseTaskOf', () => {
    it('reads a score stored at a post and its slot there as the exercise of that slot', () => {
      const round = dogRound(fourPosts, dog)
      expect(exerciseTaskOf(round, legacy('P3', 0, 13))).toEqual(scored(3, 13))
      expect(exerciseTaskOf(round, legacy('P1', 0, 11))).toEqual(scored(1, 11))
    })

    it('reads a post stored with `tasks: 2` as one exercise in two parts', () => {
      const round = dogRound({ stations: stations(4, 'P2') }, dog)
      expect(exerciseTaskOf(round, legacy('P2', 0, 8))).toEqual(scored(2, 8, 0))
      expect(exerciseTaskOf(round, legacy('P2', 1, 9))).toEqual(scored(2, 9, 1))
      expect(exerciseTaskOf(round, legacy('P3', 0, 12))).toEqual(scored(3, 12))
    })

    it('reads the slots of a post a group comes to twice in exercise order', () => {
      const round = dogRound(threePosts, dog)
      expect(exerciseTaskOf(round, legacy('P3', 1, 18))).toEqual(scored(4, 18))
    })

    it('leaves a score stored by exercise as it is, and reads nothing of a slot the round does not have', () => {
      const round = dogRound(fourPosts, dog)
      expect(exerciseTaskOf(round, scored(4, 18))).toEqual(scored(4, 18))
      expect(exerciseTaskOf(round, legacy('P3', 1))).toBeUndefined()
      expect(exerciseTaskOf(round, legacy('P9', 0))).toBeUndefined()
    })
  })

  describe('reconcileRoundTasks', () => {
    it('keeps every score when four posts are corrected to the three the trial had, and the rounds read the same', () => {
      const before = dogRound(fourPosts, dog)
      const after = dogRound(threePosts, dog)
      const stored = [scored(1, 11), scored(2, 12), scored(3, 13), scored(4, 14)]

      expect(roundsDiffer(before, after)).toBe(false)
      expect(reconcileRoundTasks(before, after, stored)).toEqual({ dropped: [], kept: stored })
    })

    it('reads scores stored at their posts against the layout they were stored in, and keeps them by exercise', () => {
      const stored = [legacy('P1', 0, 11), legacy('P2', 0, 12), legacy('P3', 0, 13), legacy('P4', 0, 14)]

      expect(reconcileRoundTasks(dogRound(fourPosts, dog), dogRound(threePosts, dog), stored)).toEqual({
        dropped: [],
        kept: [scored(1, 11), scored(2, 12), scored(3, 13), scored(4, 14)],
      })
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

  describe('two scores of one exercise', () => {
    it('keeps the one recorded later and drops the other, whichever address each is stored in', () => {
      const old = legacy('P4', 0, 14)
      const later = { ...scored(4, 18), updatedAt: '2026-09-12T11:00:00.000Z' }
      const round = dogRound(fourPosts, dog)

      expect(reconcileRoundTasks(round, dogRound(threePosts, dog), [old, later])).toEqual({
        dropped: [old],
        kept: [later],
      })
      const earlier = { ...scored(4, 18), updatedAt: '2026-09-12T09:00:00.000Z' }
      expect(addressTasks(round, [old, earlier])).toEqual({ dropped: [earlier], kept: [scored(4, 14)] })
    })
  })

  describe('legacyReadChanges', () => {
    const stored = { tasks: [legacy('P1', 0), legacy('P2', 0), legacy('P3', 0), legacy('P4', 0)] }

    it('sees a score stored by post that reads as another exercise in the new layout', () => {
      expect(legacyReadChanges(dogRound(fourPosts, dog), dogRound(threePosts, dog), stored)).toBe(true)
    })

    it('sees a stop stored by post that reads as another exercise', () => {
      const stopped = { retirement: { cause: 'injury' as const, stationId: 'P4' } }
      expect(legacyReadChanges(dogRound(fourPosts, dog), dogRound(threePosts, dog), stopped)).toBe(true)
    })

    it('sees nothing where the scores read the same, a post renumbered or the scores stored by exercise', () => {
      const renumbered = {
        stations: stations(4).map((post) => (post.id === 'P2' ? { ...post, number: 9 } : post)),
      }
      // The day's posts are in number order without a running order, so a renumbered post moves its
      // exercise; with a running order of its own, a renumbering changes nothing.
      const ordered4 = {
        rotations: ordered({ stationId: 'P1' }, { stationId: 'P2' }, { stationId: 'P3' }, { stationId: 'P4' }),
      }
      expect(
        legacyReadChanges(
          dogRound({ ...fourPosts, ...ordered4 }, dog),
          dogRound({ ...renumbered, ...ordered4 }, dog),
          stored
        )
      ).toBe(false)
      expect(
        legacyReadChanges(dogRound(fourPosts, dog), dogRound(threePosts, dog), {
          tasks: [scored(1), scored(4)],
        })
      ).toBe(false)
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
