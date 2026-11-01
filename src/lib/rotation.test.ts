import type { DayKey, EventRotationGroup, EventStation } from '../types'
import i18n from 'i18next'
import { dogRound, nowtTotals, toScoredTasks } from './results'
import {
  dayStations,
  formatRotationGroup,
  formatStationArrivals,
  readableRotations,
  rotationCoverageErrors,
  rotationDogOf,
  rotationGroupOf,
  rotationGroupsOfDay,
  rotationShapeErrors,
  rotationStartLines,
  stationArrivals,
  stationParts,
  stationQueue,
  stationTaskCount,
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

describe('stationParts and stationTaskCount', () => {
  it.each([
    [{}, 1],
    [{ parts: 2 as const }, 2],
    [{ tasks: 2 as const }, 2],
    [{ parts: 1 as const, tasks: 2 as const }, 1],
  ])('reads %o as %i parts', (station, parts) => {
    expect(stationParts(station)).toBe(parts)
  })

  it('does one task at a post unless it says more', () => {
    expect(stationTaskCount({})).toBe(1)
    expect(stationTaskCount({ taskCount: 2 })).toBe(2)
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

  it('leaves out a dog whose group does not come to the post', () => {
    expect(stationQueue(event, 'post-1', [dog('other-day', 'ALO', 1, OTHER_DAY)])).toEqual([])
  })

  it('reads the frozen number over the working order', () => {
    expect(rotationDogOf({ ...dog('a', 'AVO', 3), startGroup: { date: DAY, key: 'x', number: 12 } })).toEqual({
      class: 'AVO',
      day: DAY,
      number: 12,
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

  it('names the dogs in a gap, past the ranges or without a number', () => {
    expect(
      rotationCoverageErrors(ranged, [dog('in', 3), dog('gap', 9), dog('past', 17), dog('none'), dog('voi', 9, 'VOI')])
    ).toEqual([
      { class: 'AVO', day: DAY, number: 9, registrationId: 'gap' },
      { class: 'AVO', day: DAY, number: 17, registrationId: 'past' },
      { class: 'AVO', day: DAY, registrationId: 'none' },
    ])
  })

  it('has nothing to say of a class that is one group', () => {
    expect(rotationCoverageErrors(event, [dog('any')])).toEqual([])
  })
})

describe('readableRotations', () => {
  it('drops a post the event no longer has, and a group left without posts', () => {
    expect(
      readableRotations({
        rotations: [
          { class: 'ALO', posts: [{ stationId: 'gone' }, { stationId: 'post-2', taskCount: 2 }] },
          { class: 'AVO', posts: [{ stationId: 'gone' }] },
        ],
        stations,
      })
    ).toEqual([{ class: 'ALO', posts: [{ stationId: 'post-2', taskCount: 2 }] }])
  })

  it('drops a group whose class does not run on the day of its posts', () => {
    const classes = [{ class: 'ALO' as const, date: DAY }]

    expect(readableRotations({ classes, rotations, stations })).toEqual([rotations[0]])
  })

  it('keeps the groups as they are when nothing is amiss', () => {
    expect(readableRotations(event)).toEqual(rotations)
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
