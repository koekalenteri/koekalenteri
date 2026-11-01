import type { DayKey, EventRotationGroup, EventStation } from '../types'
import type { RotationEvent } from './rotation'
import i18n from 'i18next'
import { dogRound, nowtTotals, toScoredTasks } from './results'
import {
  dayStations,
  formatRotationGroup,
  formatStationArrivals,
  nextRotationGroup,
  rotationCoverageErrors,
  rotationDogOf,
  rotationGroupOf,
  rotationGroupsOfDay,
  rotationShapeErrors,
  rotationStartLines,
  roundInputsOf,
  stationArrivals,
  stationParts,
  stationQueue,
  stationQueueByGroup,
} from './rotation'

const DAY: DayKey = '2026-09-12'
const OTHER_DAY: DayKey = '2026-09-13'

const post = (number: number, parts: 1 | 2 = 1, date: EventStation['date'] = DAY): EventStation => ({
  date,
  id: `post-${number}${date === DAY ? '' : '-b'}`,
  number,
  parts,
})

/** The organiser's map of KOE-1665: each class starts at a different post and does two tasks at its last. */
const stations = [post(1), post(2), post(3)]
const rotations: EventRotationGroup[] = [
  { class: 'ALO', posts: [{ stationId: 'post-1' }, { stationId: 'post-2' }, { stationId: 'post-3', taskCount: 2 }] },
  { class: 'AVO', posts: [{ stationId: 'post-3' }, { stationId: 'post-1' }, { stationId: 'post-2', taskCount: 2 }] },
  { class: 'VOI', posts: [{ stationId: 'post-2' }, { stationId: 'post-3' }, { stationId: 'post-1', taskCount: 2 }] },
]
const event = { rotations, stations }

const slot = (stationId: string, index: number, taskNumber: number, task = 0, parts: 1 | 2 = 1) => ({
  index,
  maxPoints: 20 / parts,
  parts,
  stationId,
  task,
  taskNumber,
})

describe('dogRound with a rotation', () => {
  it('runs the group through its posts in its own order, two tasks at its last post', () => {
    expect(dogRound(event, { class: 'AVO', day: DAY, number: 7 })).toEqual([
      slot('post-3', 0, 1),
      slot('post-1', 0, 2),
      slot('post-2', 0, 3),
      slot('post-2', 1, 4, 1),
    ])
  })

  it.each(['ALO', 'AVO', 'VOI'] as const)('gives %s a maximum of 80, a task always being 20', (eventClass) => {
    expect(nowtTotals(toScoredTasks(dogRound(event, { class: eventClass, day: DAY, number: 1 }), [])).maxPoints).toBe(
      80
    )
  })

  it('reads a stored two-task post as one task split into two parts of 10, as before', () => {
    const legacy: EventStation = { date: DAY, id: 'post-1', number: 1, tasks: 2 }

    expect(dogRound({ stations: [legacy, post(2)] }, { class: 'ALO', day: DAY, number: 1 })).toEqual([
      slot('post-1', 0, 1, 0, 2),
      slot('post-1', 1, 1, 0, 2),
      slot('post-2', 0, 2),
    ])
  })

  it('splits each of two tasks at a post into parts, task by task', () => {
    const split: EventRotationGroup[] = [{ class: 'ALO', posts: [{ parts: 2, stationId: 'post-1', taskCount: 2 }] }]

    expect(dogRound({ rotations: split, stations }, { class: 'ALO', day: DAY })).toEqual([
      slot('post-1', 0, 1, 0, 2),
      slot('post-1', 1, 1, 0, 2),
      slot('post-1', 2, 2, 1, 2),
      slot('post-1', 3, 2, 1, 2),
    ])
  })

  it("keeps a dog to its own day's posts", () => {
    const twoDays = { stations: [post(1), post(1, 1, OTHER_DAY)] }

    expect(dogRound(twoDays, { class: 'ALO', day: OTHER_DAY }).map((task) => task.stationId)).toEqual(['post-1-b'])
  })

  it('gives a day without posts an empty round', () => {
    expect(dogRound(event, { class: 'ALO', day: OTHER_DAY })).toEqual([])
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

  it('does one task at a post unless it says more', () => {
    const twice: EventStation = { ...post(1), taskCount: 2 }

    expect(dogRound({ stations: [twice] }, { class: 'ALO', day: DAY }).map((task) => task.taskNumber)).toEqual([1, 2])
  })
})

describe('rotationGroupOf', () => {
  const single: EventRotationGroup[] = [
    { class: 'AVO', firstNumber: 1, lastNumber: 8, posts: [{ stationId: 'post-1' }, { stationId: 'post-2' }] },
    { class: 'AVO', firstNumber: 13, lastNumber: 20, posts: [{ stationId: 'post-2' }, { stationId: 'post-1' }] },
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
    expect(rotationGroupOf(event, { class: 'ALO', day: OTHER_DAY })).toEqual({ class: 'ALO', posts: [] })
    expect(rotationGroupOf({ stations: [post(2), post(1)] }, { class: 'VOI', day: DAY })).toEqual({
      class: 'VOI',
      posts: [{ stationId: 'post-1' }, { stationId: 'post-2' }],
    })
  })

  it('does not read a group whose class does not run that day', () => {
    const classes = [{ class: 'ALO' as const, date: DAY }]

    expect(rotationGroupOf({ classes, rotations, stations }, { class: 'AVO', day: DAY })).toEqual({
      class: 'AVO',
      posts: [{ stationId: 'post-1' }, { stationId: 'post-2' }, { stationId: 'post-3' }],
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
      { class: 'VOI', posts: [{ stationId: 'post-1' }, { stationId: 'post-2' }, { stationId: 'post-3' }] },
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
  it('lists the groups in the order they reach the post, with the tasks each does there', () => {
    expect(
      stationArrivals(event, 'post-1').map(({ group, tasks, tasksBefore }) => ({
        class: group.class,
        tasks,
        tasksBefore,
      }))
    ).toEqual([
      { class: 'ALO', tasks: 1, tasksBefore: 0 },
      { class: 'AVO', tasks: 1, tasksBefore: 1 },
      { class: 'VOI', tasks: 2, tasksBefore: 2 },
    ])
  })

  it('has nothing for a post the event does not have', () => {
    expect(stationArrivals(event, 'gone')).toEqual([])
  })
})

describe('stationQueue', () => {
  const dog = (id: string, eventClass: 'ALO' | 'AVO' | 'VOI', number: number, date = DAY) => ({
    class: eventClass,
    eventType: 'NOWT',
    group: { date, key: 'x', number, time: 'kp' as const },
    id,
  })

  it('lists the dogs as their groups reach the post, each group in start order', () => {
    const dogs = [dog('voi', 'VOI', 1), dog('avo-2', 'AVO', 9), dog('alo', 'ALO', 3), dog('avo-1', 'AVO', 2)]

    expect(
      stationQueue(event, 'post-3', dogs).map(({ registration, visit }) => [registration.id, visit.tasks])
    ).toEqual([
      ['avo-1', 1],
      ['avo-2', 1],
      ['voi', 1],
      ['alo', 2],
    ])
  })

  it('takes the lower range first where two groups of a class reach the post at the same turn', () => {
    const ranged: EventRotationGroup[] = [
      { class: 'AVO', firstNumber: 9, lastNumber: 16, posts: [{ stationId: 'post-1' }] },
      { class: 'AVO', firstNumber: 1, lastNumber: 8, posts: [{ stationId: 'post-1', taskCount: 2 }] },
    ]

    expect(
      stationQueue({ rotations: ranged, stations }, 'post-1', [dog('high', 'AVO', 10), dog('low', 'AVO', 3)]).map(
        ({ registration, visit }) => [registration.id, visit.tasks]
      )
    ).toEqual([
      ['low', 2],
      ['high', 1],
    ])
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

  it("gives each dog its group's own dogs at once, or the post's where the group sets none", () => {
    const pairs = {
      rotations: [
        { class: 'ALO' as const, posts: [{ dogsAtOnce: 1, stationId: 'post-1' }] },
        { class: 'AVO' as const, posts: [{ stationId: 'post-1' }] },
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

describe('stationQueueByGroup', () => {
  const dog = (id: string, eventClass: 'ALO' | 'AVO', number: number) => ({
    class: eventClass,
    eventType: 'NOWT',
    group: { date: DAY, key: 'x', number, time: 'kp' as const },
    id,
  })

  it('splits the queue of a post into its groups as they reach it, each with what it does there', () => {
    const ranged = {
      rotations: [
        {
          class: 'AVO' as const,
          firstNumber: 1,
          lastNumber: 2,
          posts: [{ stationId: 'post-2' }, { stationId: 'post-1' }],
        },
        { class: 'AVO' as const, firstNumber: 3, lastNumber: 4, posts: [{ dogsAtOnce: 2, stationId: 'post-1' }] },
      ],
      stations: [post(1), post(2)],
    }
    const dogs = [dog('a1', 'AVO', 1), dog('a3', 'AVO', 3), dog('a2', 'AVO', 2), dog('a4', 'AVO', 4)]

    expect(
      stationQueueByGroup(ranged, 'post-1', dogs).map(({ registrations, visit }) => [
        registrations.map((registration) => registration.id),
        visit.dogsAtOnce,
      ])
    ).toEqual([
      [['a3', 'a4'], 2],
      [['a1', 'a2'], undefined],
    ])
  })

  it('keeps apart two groups that do the same at the post', () => {
    const dogs = [dog('alo', 'ALO', 1), dog('avo', 'AVO', 2)]

    expect(stationQueueByGroup({ stations: [post(1)] }, 'post-1', dogs)).toHaveLength(2)
  })
})

describe('nextRotationGroup', () => {
  const classes = ['ALO', 'AVO', 'VOI'] as const
  const ids = (group: EventRotationGroup) => group.posts.map((visit) => visit.stationId)

  it("gives the day's first group the posts in number order and the first class", () => {
    expect(nextRotationGroup([post(1), post(2)], classes, [])).toEqual({
      class: 'ALO',
      posts: [{ stationId: 'post-1' }, { stationId: 'post-2' }],
    })
  })

  it('starts the next group at the post the previous one visited second, the column settings staying put', () => {
    const first = nextRotationGroup(stations, classes, [])
    const marked = { ...first, posts: first.posts.map((visit, at) => (at === 2 ? { ...visit, taskCount: 2 } : visit)) }
    const second = nextRotationGroup(stations, classes, [marked])
    const third = nextRotationGroup(stations, classes, [marked, second])

    expect([marked, second, third].map(ids)).toEqual([
      ['post-1', 'post-2', 'post-3'],
      ['post-2', 'post-3', 'post-1'],
      ['post-3', 'post-1', 'post-2'],
    ])
    expect([second, third].map((group) => group.posts.map((visit) => visit.taskCount))).toEqual([
      [undefined, undefined, 2],
      [undefined, undefined, 2],
    ])
    expect([marked, second, third].map((group) => group.class)).toEqual(['ALO', 'AVO', 'VOI'])
  })

  it("follows the previous group's own round, not the post numbers", () => {
    const previous: EventRotationGroup = {
      class: 'ALO',
      posts: [{ stationId: 'post-3' }, { stationId: 'post-1' }, { stationId: 'post-2' }],
    }

    expect(ids(nextRotationGroup(stations, classes, [previous]))).toEqual(['post-1', 'post-2', 'post-3'])
  })

  it("carries what a column does, resolved from its post's defaults, and stores only what differs from the new post's", () => {
    const defaults = [{ ...post(1), dogsAtOnce: 2 }, post(2), { ...post(3), taskCount: 2 }]
    const previous: EventRotationGroup = {
      class: 'ALO',
      posts: [{ stationId: 'post-1' }, { parts: 2, stationId: 'post-2' }, { stationId: 'post-3' }],
    }

    expect(nextRotationGroup(defaults, classes, [previous]).posts).toEqual([
      { dogsAtOnce: 2, stationId: 'post-2' },
      { parts: 2, stationId: 'post-3', taskCount: 1 },
      { dogsAtOnce: 1, stationId: 'post-1', taskCount: 2 },
    ])
  })

  it('drops a visit to a post the day no longer has', () => {
    const previous: EventRotationGroup = { class: 'ALO', posts: [{ stationId: 'post-1' }, { stationId: 'gone' }] }

    expect(ids(nextRotationGroup(stations, classes, [previous]))).toEqual([])
  })

  it('keeps a round of one post at that post', () => {
    const previous: EventRotationGroup = { class: 'ALO', posts: [{ stationId: 'post-2' }] }

    expect(ids(nextRotationGroup(stations, classes, [previous]))).toEqual(['post-2'])
  })

  it("takes the previous group's class once every class has a group, its range going on from the previous", () => {
    const previous: EventRotationGroup = {
      class: 'AVO',
      firstNumber: 1,
      lastNumber: 8,
      posts: [{ stationId: 'post-1' }, { stationId: 'post-2' }],
    }
    const next = nextRotationGroup(stations, ['AVO'], [previous])

    expect(next).toEqual({ class: 'AVO', firstNumber: 9, posts: [{ stationId: 'post-2' }, { stationId: 'post-1' }] })
  })

  it('gives no range where the previous group has no last number', () => {
    const previous: EventRotationGroup = { class: 'AVO', posts: [{ stationId: 'post-1' }] }

    expect(nextRotationGroup(stations, ['AVO'], [previous])).toEqual({
      class: 'AVO',
      posts: [{ stationId: 'post-1' }],
    })
  })
})

describe('rotationShapeErrors', () => {
  it('accepts the organiser map', () => {
    expect(rotationShapeErrors(event)).toEqual([])
  })

  it('names a group without posts, an unknown post and a post visited twice', () => {
    expect(
      rotationShapeErrors({
        rotations: [
          { class: 'ALO', posts: [] },
          { class: 'AVO', posts: [{ stationId: 'gone' }] },
          { class: 'VOI', posts: [{ stationId: 'post-1' }, { stationId: 'post-1' }] },
        ],
        stations,
      })
    ).toEqual([
      { group: 0, kind: 'noPosts' },
      { group: 1, kind: 'unknownPost', stationId: 'gone' },
      { group: 2, kind: 'postTwice', stationId: 'post-1' },
    ])
  })

  it('refuses a group whose posts are on different days', () => {
    expect(
      rotationShapeErrors({
        rotations: [{ class: 'ALO', posts: [{ stationId: 'post-1' }, { stationId: 'post-1-b' }] }],
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
          { class: 'AVO', ...range(first), posts: [{ stationId: 'post-1' }] },
          { class: 'AVO', ...range(second), posts: [{ stationId: 'post-2' }] },
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
    expect(
      rotationShapeErrors({ rotations: [{ class: 'ALO', ...range, posts: [{ stationId: 'post-1' }] }], stations })
    ).toEqual([{ group: 0, kind: 'range' }])
  })

  it('refuses two groups of one class and day that both hold every number', () => {
    expect(
      rotationShapeErrors({
        rotations: [
          { class: 'AVO', posts: [{ stationId: 'post-1' }] },
          { class: 'AVO', posts: [{ stationId: 'post-2' }] },
        ],
        stations,
      })
    ).toEqual([{ group: 0, kind: 'overlap', other: 1 }])
  })

  it('lets the same numbers repeat in another class or on another day', () => {
    expect(
      rotationShapeErrors({
        rotations: [
          { class: 'AVO', firstNumber: 1, lastNumber: 8, posts: [{ stationId: 'post-1' }] },
          { class: 'VOI', firstNumber: 1, lastNumber: 8, posts: [{ stationId: 'post-1' }] },
          { class: 'AVO', firstNumber: 1, lastNumber: 8, posts: [{ stationId: 'post-1-b' }] },
        ],
        stations: [...stations, post(1, 1, OTHER_DAY)],
      })
    ).toEqual([])
  })
})

describe('rotationCoverageErrors', () => {
  const ranged = {
    rotations: [
      { class: 'AVO' as const, firstNumber: 1, lastNumber: 8, posts: [{ stationId: 'post-1' }] },
      { class: 'AVO' as const, firstNumber: 10, lastNumber: 16, posts: [{ stationId: 'post-2' }] },
    ],
    stations,
  }
  const dog = (id: string, number?: number, eventClass: 'AVO' | 'VOI' = 'AVO') => ({
    class: eventClass,
    eventType: 'NOWT',
    group: { date: DAY, key: 'x', ...(number === undefined ? {} : { number }) },
    id,
  })

  it('names the dogs in a gap or past the ranges, and leaves a dog without a number to the first group', () => {
    expect(
      rotationCoverageErrors(ranged, [dog('in', 3), dog('gap', 9), dog('past', 17), dog('none'), dog('voi', 9, 'VOI')])
    ).toEqual([
      { class: 'AVO', day: DAY, number: 9, registrationId: 'gap' },
      { class: 'AVO', day: DAY, number: 17, registrationId: 'past' },
    ])
  })

  it('has nothing to say of a class that is one group', () => {
    expect(rotationCoverageErrors(event, [dog('any')])).toEqual([])
  })
})

describe('formatting', () => {
  const t = i18n.getFixedT('fi')

  it('names a group by its class, and by its numbers where it has a range', () => {
    expect(formatRotationGroup(rotations[0], t)).toBe('ALO')
    expect(formatRotationGroup({ class: 'AVO', firstNumber: 1, lastNumber: 8, posts: [] }, t)).toBe('AVO 1–8')
  })

  it("reads a post as the organiser's map does", () => {
    expect(formatStationArrivals(event, stations[0], t)).toBe('Rasti 1: ALO, AVO, VOI (x 2)')
  })

  it('says how many parts a split task has', () => {
    const split: EventRotationGroup[] = [{ class: 'ALO', posts: [{ parts: 2, stationId: 'post-1' }] }]

    expect(formatStationArrivals({ rotations: split, stations }, stations[0], t)).toBe('Rasti 1: ALO (2 osaa)')
  })
})

describe('rotationStartLines', () => {
  const t = i18n.getFixedT('fi')
  const ranged: EventRotationGroup[] = [
    { class: 'AVO', firstNumber: 9, lastNumber: 16, posts: [{ stationId: 'post-2' }, { stationId: 'post-1' }] },
    {
      class: 'AVO',
      firstNumber: 1,
      lastNumber: 8,
      posts: [{ stationId: 'post-1' }, { parts: 2, stationId: 'post-2' }],
    },
  ]

  it('says where a group starts and in which order it goes round', () => {
    expect(rotationStartLines(event, 'VOI', DAY, false, t)).toEqual([
      'VOI: aloittaa rastilta 2, kiertää rastit 2, 3, 1 (x 2)',
    ])
  })

  it('names the groups of a range in start number order, once the numbers are out', () => {
    expect(rotationStartLines({ rotations: ranged, stations }, 'AVO', DAY, true, t)).toEqual([
      'AVO 1–8: aloittaa rastilta 1, kiertää rastit 1, 2 (2 osaa)',
      'AVO 9–16: aloittaa rastilta 2, kiertää rastit 2, 1',
    ])
    expect(rotationStartLines({ rotations: ranged, stations }, 'AVO', DAY, false, t)).toEqual([])
  })

  it('has nothing to say of a day that runs in number order', () => {
    expect(rotationStartLines({ stations }, 'ALO', DAY, true, t)).toEqual([])
  })
})

describe('roundInputsOf (KOE-1666)', () => {
  const event: RotationEvent = { classes: [{ class: 'ALO', date: DAY }], stations: [post(1)] }

  it('reads a post with its defaults filled in, so an absent default is the same as the default', () => {
    expect(roundInputsOf(event)).toEqual({
      classes: [{ class: 'ALO', day: DAY }],
      rotations: [],
      stations: [{ day: DAY, id: 'post-1', number: 1, parts: 1, taskCount: 1 }],
    })
    expect(roundInputsOf({ ...event, stations: [{ ...post(1), taskCount: 1 }] })).toEqual(roundInputsOf(event))
  })

  it('leaves out what decides no round: the judges, the link token, the phases', () => {
    const busy = { ...post(1), judges: [{ id: 1, name: 'Tuomari' }], phases: ['aamu'], tokenVersion: 3 }
    expect(roundInputsOf({ ...event, stations: [busy] })).toEqual(roundInputsOf(event))
  })

  it('reads a rotation group whose posts come in another order as a change', () => {
    const group = (posts: string[]): EventRotationGroup => ({
      class: 'ALO',
      posts: posts.map((stationId) => ({ stationId })),
    })
    const ordered = { ...event, rotations: [group(['post-1', 'post-2'])], stations: [post(1), post(2)] }
    const reordered = { ...ordered, rotations: [group(['post-2', 'post-1'])] }

    expect(roundInputsOf(reordered)).not.toEqual(roundInputsOf(ordered))
    expect(roundInputsOf(ordered).rotations).toEqual(ordered.rotations)
  })

  it('leaves out how many dogs a group takes at once: it changes no round and no score', () => {
    const group = (dogsAtOnce?: number): EventRotationGroup => ({
      class: 'ALO',
      posts: [{ stationId: 'post-1', ...(dogsAtOnce ? { dogsAtOnce } : {}) }],
    })

    expect(roundInputsOf({ ...event, rotations: [group(2)] })).toEqual(
      roundInputsOf({ ...event, rotations: [group()] })
    )
  })

  it('reads an event without posts or classes as empty', () => {
    expect(roundInputsOf({})).toEqual({ classes: [], rotations: [], stations: [] })
  })
})
