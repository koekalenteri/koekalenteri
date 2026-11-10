import type { DayKey, EventRotationGroup, EventStation } from '../types'
import type { RotationEvent } from './rotation'
import i18n from 'i18next'
import { nowtTotals } from './results'
import { dogRound, toScoredTasks } from './resultTasks'
import {
  dayStations,
  formatRotationGroup,
  formatStationArrivals,
  nextRotationGroup,
  pruneRotationClasses,
  rotationCoverageErrors,
  rotationDogOf,
  rotationGroupOf,
  rotationGroupsOfDay,
  rotationShapeErrors,
  rotationStartLines,
  rotationWarnings,
  roundInputsOf,
  stationArrivals,
  stationParts,
  stationQueue,
  stationQueueEntries,
} from './rotation'

const DAY: DayKey = '2026-09-12'
const OTHER_DAY: DayKey = '2026-09-13'

const post = (number: number, parts: 1 | 2 = 1, date: EventStation['date'] = DAY): EventStation => ({
  date,
  id: `post-${number}${date === DAY ? '' : '-b'}`,
  number,
  parts,
})

/** A running order by post numbers, each exercise at the post's defaults. */
const order = (...numbers: number[]) => numbers.map((number) => ({ stationId: `post-${number}` }))

/** The organiser's map of KOE-1665: each class starts at a different post and does its last two exercises at one. */
const stations = [post(1), post(2), post(3)]
const rotations: EventRotationGroup[] = [
  { class: 'ALO', exercises: order(1, 2, 3, 3) },
  { class: 'AVO', exercises: order(3, 1, 2, 2) },
  { class: 'VOI', exercises: order(2, 3, 1, 1) },
]
const event = { rotations, stations }

/** A slot of a dog's round. */
const slot = (exercise: number, stationId: string, part = 0, parts: 1 | 2 = 1) => ({
  exercise,
  maxPoints: 20 / parts,
  part,
  parts,
  stationId,
})

const dog = (id: string, eventClass: 'ALO' | 'AVO' | 'VOI', number: number, date = DAY) => ({
  class: eventClass,
  eventType: 'NOWT',
  group: { date, key: 'x', number, time: 'kp' as const },
  id,
})

describe('dogRound with a running order', () => {
  it('numbers the exercises 1..n in the order the group does them, the same post twice in a row', () => {
    expect(dogRound(event, { class: 'AVO', day: DAY, number: 7 })).toEqual([
      slot(1, 'post-3'),
      slot(2, 'post-1'),
      slot(3, 'post-2'),
      slot(4, 'post-2'),
    ])
  })

  it.each(['ALO', 'AVO', 'VOI'] as const)('gives %s a maximum of 80, an exercise always being 20', (eventClass) => {
    expect(nowtTotals(toScoredTasks(dogRound(event, { class: eventClass, day: DAY, number: 1 }), [])).maxPoints).toBe(
      80
    )
  })

  it('lays out a post the group comes to twice apart, an exercise each time', () => {
    const twice = { rotations: [{ class: 'ALO' as const, exercises: order(1, 2, 1, 2) }], stations }

    expect(dogRound(twice, { class: 'ALO', day: DAY })).toEqual([
      slot(1, 'post-1'),
      slot(2, 'post-2'),
      slot(3, 'post-1'),
      slot(4, 'post-2'),
    ])
  })

  it('runs a class without an order of its own through one exercise at each post in number order', () => {
    expect(dogRound({ stations }, { class: 'ALO', day: DAY })).toEqual([
      slot(1, 'post-1'),
      slot(2, 'post-2'),
      slot(3, 'post-3'),
    ])
  })

  it('reads a post stored with two tasks before KOE-1665 as one exercise in two parts, as before', () => {
    const legacy: EventStation = { date: DAY, id: 'post-1', number: 1, tasks: 2 }

    expect(dogRound({ stations: [legacy, post(2)] }, { class: 'ALO', day: DAY })).toEqual([
      slot(1, 'post-1', 0, 2),
      slot(1, 'post-1', 1, 2),
      slot(2, 'post-2'),
    ])
  })

  it('splits each of two exercises at a post into parts, exercise by exercise', () => {
    const split: EventRotationGroup[] = [
      {
        class: 'ALO',
        exercises: [
          { parts: 2, stationId: 'post-1' },
          { parts: 2, stationId: 'post-1' },
        ],
      },
    ]

    expect(dogRound({ rotations: split, stations }, { class: 'ALO', day: DAY })).toEqual([
      slot(1, 'post-1', 0, 2),
      slot(1, 'post-1', 1, 2),
      slot(2, 'post-1', 0, 2),
      slot(2, 'post-1', 1, 2),
    ])
  })

  it("keeps a dog to its own day's posts", () => {
    const twoDays = { stations: [post(1), post(1, 1, OTHER_DAY)] }

    expect(dogRound(twoDays, { class: 'ALO', day: OTHER_DAY }).map((task) => task.stationId)).toEqual(['post-1-b'])
  })

  it('gives a day without posts an empty round', () => {
    expect(dogRound(event, { class: 'ALO', day: OTHER_DAY })).toEqual([])
  })

  it('reads a group stored before the running order, with posts and no exercises, as no group at all', () => {
    const stored = { class: 'ALO', posts: [{ stationId: 'post-1', taskCount: 2 }] }
    // A dev row of the shape #1708 wrote: read as it is, never converted, until the secretary removes it.
    const legacy = { rotations: [JSON.parse(JSON.stringify(stored))], stations }

    expect(dogRound(legacy, { class: 'ALO', day: DAY })).toEqual(dogRound({ stations }, { class: 'ALO', day: DAY }))
    expect(rotationShapeErrors(legacy)).toEqual([{ group: 0, kind: 'noExercises' }])
  })
})

describe('stationParts', () => {
  it.each([
    [{}, 1],
    [{ parts: 2 as const }, 2],
    [{ tasks: 2 as const }, 2],
    [{ parts: 1 as const, tasks: 2 as const }, 1],
  ])('reads %o as %i parts', (station, parts) => {
    expect(stationParts(station)).toBe(parts)
  })
})

describe('rotationGroupOf', () => {
  const single: EventRotationGroup[] = [
    { class: 'AVO', exercises: order(1, 2), firstNumber: 1, lastNumber: 8 },
    { class: 'AVO', exercises: order(2, 1), firstNumber: 13, lastNumber: 20 },
  ]
  const split = { rotations: single, stations }

  it.each([
    [5, 0],
    [15, 1],
  ])('puts number %i in the group whose range holds it', (number, group) => {
    expect(rotationGroupOf(split, { class: 'AVO', day: DAY, number })).toBe(single[group])
  })

  it.each([
    ['above the last range, the last group', 30, 1],
    ['in a gap, the group below', 10, 0],
    ['without a number, the first group', undefined, 0],
  ])('puts a dog outside every range in the nearest group: %s', (_case, number, group) => {
    expect(rotationGroupOf(split, { class: 'AVO', day: DAY, number })).toBe(single[group])
  })

  it('puts a dog below the first range in the first group', () => {
    const late: EventRotationGroup[] = [{ ...single[0], firstNumber: 4 }, single[1]]

    expect(rotationGroupOf({ rotations: late, stations }, { class: 'AVO', day: DAY, number: 2 })).toBe(late[0])
  })

  it('runs a class without a group of its own through the posts in number order', () => {
    expect(rotationGroupOf(event, { class: 'ALO', day: OTHER_DAY })).toEqual({ class: 'ALO', exercises: [] })
    expect(rotationGroupOf({ stations: [post(2), post(1)] }, { class: 'VOI', day: DAY })).toEqual({
      class: 'VOI',
      exercises: order(1, 2),
    })
  })

  it('does not read a group whose class does not run that day', () => {
    const classes = [{ class: 'ALO' as const, date: DAY }]

    expect(rotationGroupOf({ classes, rotations, stations }, { class: 'AVO', day: DAY })).toEqual({
      class: 'AVO',
      exercises: order(1, 2, 3),
    })
  })
})

describe('rotationGroupsOfDay', () => {
  it("lists the day's classes, a default group for a class with none", () => {
    const classes = [
      { class: 'VOI' as const, date: DAY },
      { class: 'ALO' as const, date: DAY },
    ]
    const only = [rotations[0]]

    expect(rotationGroupsOfDay({ classes, rotations: only, stations }, DAY)).toEqual([
      rotations[0],
      { class: 'VOI', exercises: order(1, 2, 3) },
    ])
  })
})

describe('dayStations', () => {
  it("gives the day's posts in number order", () => {
    expect(dayStations({ stations: [post(2), post(1, 1, OTHER_DAY), post(1)] }, DAY).map((item) => item.id)).toEqual([
      'post-1',
      'post-2',
    ])
  })
})

describe('stationArrivals', () => {
  it('lists the visits in exercise order, a group coming once for each exercise, in a row or apart', () => {
    const arrivals = (rotationEvent: RotationEvent) =>
      stationArrivals(rotationEvent, 'post-1').map(({ exercise, group }) => [group.class, exercise])
    const twiceApart = {
      rotations: [
        { class: 'ALO' as const, exercises: order(1, 2, 1, 2) },
        { class: 'AVO' as const, exercises: order(2, 1, 2, 1) },
      ],
      stations,
    }

    expect(arrivals(event)).toEqual([
      ['ALO', 1],
      ['AVO', 2],
      ['VOI', 3],
      ['VOI', 4],
    ])
    expect(arrivals(twiceApart)).toEqual([
      ['ALO', 1],
      ['AVO', 2],
      ['ALO', 3],
      ['AVO', 4],
    ])
  })

  it('has nothing for a post the event does not have', () => {
    expect(stationArrivals(event, 'gone')).toEqual([])
  })
})

describe('stationQueue', () => {
  it('lists the dogs exercise by exercise: all of a group for its first exercise at the post, then its second', () => {
    const dogs = [dog('voi-2', 'VOI', 2), dog('avo', 'AVO', 9), dog('voi-1', 'VOI', 1), dog('alo', 'ALO', 3)]

    expect(
      stationQueue(event, 'post-1', dogs).map(({ registration, visit }) => [registration.id, visit.exercise])
    ).toEqual([
      ['alo', 1],
      ['avo', 2],
      ['voi-1', 3],
      ['voi-2', 3],
      ['voi-1', 4],
      ['voi-2', 4],
    ])
  })

  it('takes the lower range first where two groups of a class come for the same exercise', () => {
    const ranged: EventRotationGroup[] = [
      { class: 'AVO', exercises: order(1), firstNumber: 9, lastNumber: 16 },
      { class: 'AVO', exercises: order(1), firstNumber: 1, lastNumber: 8 },
    ]

    expect(
      stationQueue({ rotations: ranged, stations }, 'post-1', [dog('high', 'AVO', 10), dog('low', 'AVO', 3)]).map(
        ({ registration }) => registration.id
      )
    ).toEqual(['low', 'high'])
  })

  it("keeps a day's post to that day's dogs where both days have posts", () => {
    const twoDays = { stations: [post(1), post(1, 1, OTHER_DAY)] }
    const dogs = [dog('first', 'ALO', 1), dog('second', 'ALO', 2, OTHER_DAY)]

    expect(stationQueue(twoDays, 'post-1', dogs).map(({ registration }) => registration.id)).toEqual(['first'])
    expect(stationQueue(twoDays, 'post-1-b', dogs).map(({ registration }) => registration.id)).toEqual(['second'])
  })

  it('leaves out a dog whose group does not come to the post', () => {
    expect(stationQueue(event, 'post-1', [dog('other-day', 'ALO', 1, OTHER_DAY)])).toEqual([])
  })

  it("gives each dog its exercise's own dogs at once, or the post's where the exercise sets none", () => {
    const pairs = {
      rotations: [
        { class: 'ALO' as const, exercises: [{ dogsAtOnce: 1, stationId: 'post-1' }] },
        { class: 'AVO' as const, exercises: order(1) },
      ],
      stations: [{ ...post(1), dogsAtOnce: 2 }],
    }

    expect(
      stationQueue(pairs, 'post-1', [dog('avo', 'AVO', 2), dog('alo', 'ALO', 1)]).map(({ registration, visit }) => [
        registration.id,
        visit.dogsAtOnce,
      ])
    ).toEqual([
      ['alo', 1],
      ['avo', 2],
    ])
  })

  it('reads the frozen number over the working order', () => {
    expect(rotationDogOf({ ...dog('a', 'AVO', 3), startGroup: { date: DAY, key: 'x', number: 12 } })).toEqual({
      class: 'AVO',
      day: DAY,
      number: 12,
    })
  })
})

describe('stationQueueEntries', () => {
  it("splits a post's queue into visits, a group's exercise each, with that exercise's dogs at once", () => {
    const twoHere = {
      rotations: [
        { class: 'AVO' as const, exercises: [{ stationId: 'post-1' }, { dogsAtOnce: 2, stationId: 'post-1' }] },
      ],
      stations: [post(1)],
    }
    const dogs = [dog('a2', 'AVO', 2), dog('a1', 'AVO', 1)]

    expect(
      stationQueueEntries(twoHere, 'post-1', dogs).map(({ registrations, visit }) => [
        registrations.map((registration) => registration.id),
        visit.exercise,
        visit.dogsAtOnce,
      ])
    ).toEqual([
      [['a1', 'a2'], 1, undefined],
      [['a1', 'a2'], 2, 2],
    ])
  })

  it('keeps apart two groups that do the same exercise at the post', () => {
    const dogs = [dog('alo', 'ALO', 1), dog('avo', 'AVO', 2)]

    expect(stationQueueEntries({ stations: [post(1)] }, 'post-1', dogs)).toHaveLength(2)
  })
})

describe('nextRotationGroup', () => {
  const classes = ['ALO', 'AVO', 'VOI'] as const
  const ids = (group: EventRotationGroup) => (group.exercises ?? []).map((exercise) => exercise.stationId)

  it("gives the day's first group one exercise at each post in number order, and the first class", () => {
    expect(nextRotationGroup([post(1), post(2)], classes, [])).toEqual({ class: 'ALO', exercises: order(1, 2) })
  })

  it('moves the next group on by one post over the runs, a post repeated in a row staying in a row', () => {
    const first = nextRotationGroup(stations, classes, [])
    const second = nextRotationGroup(stations, classes, [first])
    const third = nextRotationGroup(stations, classes, [first, second])
    expect([first, second, third].map(ids)).toEqual([
      ['post-1', 'post-2', 'post-3'],
      ['post-2', 'post-3', 'post-1'],
      ['post-3', 'post-1', 'post-2'],
    ])
    expect([first, second, third].map((group) => group.class)).toEqual(['ALO', 'AVO', 'VOI'])

    const fourth = { ...first, exercises: order(1, 2, 3, 3) }
    const after = nextRotationGroup(stations, classes, [fourth])
    expect([ids(after), ids(nextRotationGroup(stations, classes, [fourth, after]))]).toEqual([
      ['post-2', 'post-3', 'post-1', 'post-1'],
      ['post-3', 'post-1', 'post-2', 'post-2'],
    ])
  })

  it('moves a running order that comes to a post twice apart one post on as well', () => {
    const twice: EventRotationGroup = { class: 'ALO', exercises: order(1, 2, 1, 2) }

    expect(ids(nextRotationGroup(stations, classes, [twice]))).toEqual(['post-2', 'post-1', 'post-2', 'post-1'])
  })

  it('keeps an exercise its parts and dogs at once with its number, resolved from the old post and stored against the new', () => {
    const defaults = [{ ...post(1), dogsAtOnce: 2 }, post(2), post(3)]
    const previous: EventRotationGroup = {
      class: 'ALO',
      exercises: [{ stationId: 'post-1' }, { parts: 2, stationId: 'post-2' }, { stationId: 'post-3' }],
    }

    expect(nextRotationGroup(defaults, classes, [previous]).exercises).toEqual([
      { dogsAtOnce: 2, stationId: 'post-2' },
      { parts: 2, stationId: 'post-3' },
      { dogsAtOnce: 1, stationId: 'post-1' },
    ])
  })

  it('drops an exercise at a post the day no longer has', () => {
    const previous: EventRotationGroup = { class: 'ALO', exercises: [{ stationId: 'post-1' }, { stationId: 'gone' }] }

    expect(ids(nextRotationGroup(stations, classes, [previous]))).toEqual([])
  })

  it("takes the previous group's class once every class has a group, its range going on from the previous", () => {
    const previous: EventRotationGroup = { class: 'AVO', exercises: order(1, 2), firstNumber: 1, lastNumber: 8 }

    expect(nextRotationGroup(stations, ['AVO'], [previous])).toEqual({
      class: 'AVO',
      exercises: order(2, 1),
      firstNumber: 9,
    })
  })

  it('gives no range where the previous group has no last number', () => {
    const previous: EventRotationGroup = { class: 'AVO', exercises: order(1) }

    expect(nextRotationGroup(stations, ['AVO'], [previous])).toEqual({ class: 'AVO', exercises: order(1) })
  })
})

describe('rotationShapeErrors', () => {
  it('accepts the organiser map, a post twice in a row', () => {
    expect(rotationShapeErrors(event)).toEqual([])
  })

  it('accepts a running order that comes to a post twice apart', () => {
    expect(rotationShapeErrors({ rotations: [{ class: 'ALO', exercises: order(1, 2, 1, 2) }], stations })).toEqual([])
  })

  it('names a group without exercises and an unknown post', () => {
    expect(
      rotationShapeErrors({
        rotations: [
          { class: 'ALO', exercises: [] },
          { class: 'AVO', exercises: [{ stationId: 'gone' }] },
        ],
        stations,
      })
    ).toEqual([
      { group: 0, kind: 'noExercises' },
      { group: 1, kind: 'unknownPost', stationId: 'gone' },
    ])
  })

  // KOE-674: a group runs a class the event runs, an own class among them.
  it('refuses a group of a class the event does not run, and takes one of its own classes', () => {
    const classes = [{ class: 'DERBY', date: DAY }]

    expect(rotationShapeErrors({ classes, rotations: [{ class: 'ALO', exercises: order(1) }], stations })).toEqual([
      { group: 0, kind: 'unknownClass' },
    ])
    expect(rotationShapeErrors({ classes, rotations: [{ class: 'DERBY', exercises: order(1) }], stations })).toEqual([])
  })

  it('refuses a group whose posts are on different days', () => {
    expect(
      rotationShapeErrors({
        rotations: [{ class: 'ALO', exercises: [{ stationId: 'post-1' }, { stationId: 'post-1-b' }] }],
        stations: [...stations, post(1, 1, OTHER_DAY)],
      })
    ).toEqual([{ group: 0, kind: 'mixedDays' }])
  })

  it.each([
    ['ranges that share a number', [1, 8], [8, 16]],
    ['a range beside a group of the whole class', [1, 8], undefined],
  ])('refuses %s in one class on one day', (_case, first, second) => {
    const range = (numbers?: number[]) => (numbers ? { firstNumber: numbers[0], lastNumber: numbers[1] } : {})

    expect(
      rotationShapeErrors({
        rotations: [
          { class: 'AVO', ...range(first), exercises: order(1) },
          { class: 'AVO', ...range(second), exercises: order(2) },
        ],
        stations,
      })
    ).toEqual([{ group: 0, kind: 'overlap', other: 1 }])
  })

  it.each([
    ['a first number alone', { firstNumber: 1 }],
    ['a last number alone', { lastNumber: 8 }],
    ['a range the wrong way round', { firstNumber: 9, lastNumber: 1 }],
  ])('refuses %s', (_case, range) => {
    expect(rotationShapeErrors({ rotations: [{ class: 'ALO', ...range, exercises: order(1) }], stations })).toEqual([
      { group: 0, kind: 'range' },
    ])
  })

  it('refuses two groups of one class and day that both hold every number', () => {
    expect(
      rotationShapeErrors({
        rotations: [
          { class: 'AVO', exercises: order(1) },
          { class: 'AVO', exercises: order(2) },
        ],
        stations,
      })
    ).toEqual([{ group: 0, kind: 'overlap', other: 1 }])
  })

  it('lets the same numbers repeat in another class or on another day', () => {
    expect(
      rotationShapeErrors({
        rotations: [
          { class: 'AVO', exercises: order(1), firstNumber: 1, lastNumber: 8 },
          { class: 'VOI', exercises: order(1), firstNumber: 1, lastNumber: 8 },
          { class: 'AVO', exercises: [{ stationId: 'post-1-b' }], firstNumber: 1, lastNumber: 8 },
        ],
        stations: [...stations, post(1, 1, OTHER_DAY)],
      })
    ).toEqual([])
  })
})

// KOE-674: a save that changes the classes keeps the groups of the classes the event still runs.
describe('pruneRotationClasses', () => {
  const classes = [{ class: 'DERBY', date: DAY }]
  const derby: EventRotationGroup = { class: 'DERBY', exercises: order(1) }

  it('drops the groups of a class the event no longer runs', () => {
    expect(pruneRotationClasses({ classes, rotations: [derby, { class: 'VET', exercises: order(2) }] })).toEqual([
      derby,
    ])
  })

  // A classless dog's key is its entry's type, which the trial's format or its own type names.
  it.each([
    ['its format', { eventType: 'WT-harjoitus', officialFormat: 'NOWT' as const }, 'NOWT'],
    ['its own type', { eventType: 'WT-harjoitus', officialFormat: 'NOWT' as const }, 'WT-harjoitus'],
    ['an official type', { eventType: 'NOWT' }, 'NOWT'],
  ])('keeps the group of a classless trial keyed by %s', (_case, type, key) => {
    const group: EventRotationGroup = { class: key, exercises: order(1) }

    expect(pruneRotationClasses({ ...type, classes: [], rotations: [group] })).toEqual([group])
  })

  it('drops the group of the last class taken away', () => {
    const event = { classes: [], eventType: 'WT-harjoitus', officialFormat: 'NOWT' as const, rotations: [derby] }

    expect(pruneRotationClasses(event)).toEqual([])
  })

  it('gives an event without groups none', () => {
    expect(pruneRotationClasses({ classes })).toEqual([])
  })
})

describe('rotationWarnings', () => {
  it('warns, without refusing, of a running order of other than four or five exercises', () => {
    const three = { rotations: [{ class: 'ALO' as const, exercises: order(1, 2, 3) }], stations }

    expect(rotationWarnings(three)).toEqual([{ count: 3, group: 0 }])
    expect(rotationShapeErrors(three)).toEqual([])
    expect(rotationWarnings(event)).toEqual([])
  })
})

describe('rotationCoverageErrors', () => {
  const ranged = {
    rotations: [
      { class: 'AVO' as const, exercises: order(1), firstNumber: 1, lastNumber: 8 },
      { class: 'AVO' as const, exercises: order(2), firstNumber: 10, lastNumber: 16 },
    ],
    stations,
  }
  const entered = (id: string, number?: number, eventClass: 'AVO' | 'VOI' = 'AVO') => ({
    class: eventClass,
    eventType: 'NOWT',
    group: { date: DAY, key: 'x', ...(number === undefined ? {} : { number }) },
    id,
  })

  it('names the dogs in a gap or past the ranges, and leaves a dog without a number to the first group', () => {
    expect(
      rotationCoverageErrors(ranged, [
        entered('in', 3),
        entered('gap', 9),
        entered('past', 17),
        entered('none'),
        entered('voi', 9, 'VOI'),
      ])
    ).toEqual([
      { class: 'AVO', day: DAY, number: 9, registrationId: 'gap' },
      { class: 'AVO', day: DAY, number: 17, registrationId: 'past' },
    ])
  })

  it('has nothing to say of a class that is one group', () => {
    expect(rotationCoverageErrors(event, [entered('any')])).toEqual([])
  })
})

describe('formatting', () => {
  const t = i18n.getFixedT('fi')

  it('names a group by its class, and by its numbers where it has a range', () => {
    expect(formatRotationGroup(rotations[0], t)).toBe('ALO')
    expect(formatRotationGroup({ class: 'AVO', exercises: [], firstNumber: 1, lastNumber: 8 }, t)).toBe('AVO 1–8')
  })

  it("reads a post as the organiser's map does, by exercise number, a group's visits in a row together", () => {
    const twiceApart = {
      rotations: [
        { class: 'ALO' as const, exercises: order(1, 2, 1, 2) },
        { class: 'AVO' as const, exercises: order(2, 1, 2, 1) },
      ],
      stations,
    }

    expect(formatStationArrivals(event, stations[0], t)).toBe(
      'Suorituspaikka 1: ALO (rasti 1), AVO (rasti 2), VOI (rastit 3 ja 4)'
    )
    expect(formatStationArrivals(twiceApart, stations[0], t)).toBe(
      'Suorituspaikka 1: ALO (rasti 1), AVO (rasti 2), ALO (rasti 3), AVO (rasti 4)'
    )
  })

  it('says how many parts a split exercise has', () => {
    const split: EventRotationGroup[] = [{ class: 'ALO', exercises: [{ parts: 2, stationId: 'post-1' }] }]

    expect(formatStationArrivals({ rotations: split, stations }, stations[0], t)).toBe(
      'Suorituspaikka 1: ALO (rasti 1, 2 osaa)'
    )
  })
})

describe('rotationStartLines', () => {
  const t = i18n.getFixedT('fi')
  const ranged: EventRotationGroup[] = [
    { class: 'AVO', exercises: order(2, 1), firstNumber: 9, lastNumber: 16 },
    { class: 'AVO', exercises: order(1, 2), firstNumber: 1, lastNumber: 8 },
  ]

  it('tells the running order as posts', () => {
    expect(rotationStartLines(event, 'ALO', DAY, false, t, 'fi')).toEqual(['ALO: suorituspaikat 1, 2, 3, 3'])
  })

  it('names the groups of a range in start number order, once the numbers are out', () => {
    expect(rotationStartLines({ rotations: ranged, stations }, 'AVO', DAY, true, t, 'fi')).toEqual([
      'AVO 1–8: suorituspaikat 1, 2',
      'AVO 9–16: suorituspaikat 2, 1',
    ])
    expect(rotationStartLines({ rotations: ranged, stations }, 'AVO', DAY, false, t, 'fi')).toEqual([])
  })

  it('has nothing to say of a day that runs in number order', () => {
    expect(rotationStartLines({ stations }, 'ALO', DAY, true, t, 'fi')).toEqual([])
  })

  // KOE-674: the public list names an own class by its name; the posts' and the admin's sheets keep
  // the code (formatStationArrivals).
  it('names an own class by its name on the public list, and leaves the posts the code', () => {
    const own = {
      ownClasses: [{ code: 'DERBY', name: { fi: 'Derby-luokka' } }],
      rotations: ranged.map((group) => ({ ...group, class: 'DERBY' })),
      stations,
    }

    expect(rotationStartLines(own, 'DERBY', DAY, true, t, 'fi')).toEqual([
      'Derby-luokka 1–8: suorituspaikat 1, 2',
      'Derby-luokka 9–16: suorituspaikat 2, 1',
    ])
    expect(formatStationArrivals(own, stations[0], t)).toContain('DERBY 1–8')
  })
})

describe('roundInputsOf (KOE-1666)', () => {
  const event: RotationEvent = { classes: [{ class: 'ALO', date: DAY }], stations: [post(1)] }
  const group = (exercises: EventRotationGroup['exercises']): EventRotationGroup => ({ class: 'ALO', exercises })

  it('reads a post with its defaults filled in, so an absent default is the same as the default', () => {
    expect(roundInputsOf(event)).toEqual({
      classes: [{ class: 'ALO', day: DAY }],
      rotations: [],
      stations: [{ day: DAY, id: 'post-1', number: 1, parts: 1 }],
    })
    expect(roundInputsOf({ ...event, stations: [{ ...post(1), parts: undefined }] })).toEqual(roundInputsOf(event))
  })

  it('leaves out what decides no round: the judges, the link token, the phases', () => {
    const busy = { ...post(1), judges: [{ id: 1, name: 'Tuomari' }], phases: ['aamu'], tokenVersion: 3 }
    expect(roundInputsOf({ ...event, stations: [busy] })).toEqual(roundInputsOf(event))
  })

  it('reads a running order in another order as a change', () => {
    const ordered = { ...event, rotations: [group(order(1, 2))], stations: [post(1), post(2)] }
    const reordered = { ...ordered, rotations: [group(order(2, 1))] }

    expect(roundInputsOf(reordered)).not.toEqual(roundInputsOf(ordered))
  })

  it('leaves out how many dogs an exercise takes at once: it changes no round and no score', () => {
    expect(roundInputsOf({ ...event, rotations: [group([{ dogsAtOnce: 2, stationId: 'post-1' }])] })).toEqual(
      roundInputsOf({ ...event, rotations: [group(order(1))] })
    )
  })

  it('reads an event without posts or classes as empty', () => {
    expect(roundInputsOf({})).toEqual({ classes: [], rotations: [], stations: [] })
  })
})

// KOE-1723: an unofficial trial that follows NOWT runs its own classes at the posts as NOWT runs ALO.
describe('an own class of a trial that follows NOWT', () => {
  const pirkka = {
    classes: [
      { class: 'YKS', date: DAY },
      { class: 'VET', date: DAY },
    ],
    ownClasses: [
      { code: 'YKS', name: { fi: 'Yksilö' } },
      { code: 'VET', name: { fi: 'Veteraanit' } },
    ],
    rotations: [{ class: 'YKS', exercises: order(1, 2) }],
    stations: [post(1), post(2)],
  }

  it('gives a dog of an own class its class running order', () => {
    expect(dogRound(pirkka, { class: 'YKS', day: DAY })).toEqual([slot(1, 'post-1'), slot(2, 'post-2')])
  })

  it('runs an own class without an order of its own through one exercise at each post', () => {
    expect(dogRound(pirkka, { class: 'VET', day: DAY })).toEqual([slot(1, 'post-1'), slot(2, 'post-2')])
  })
})
