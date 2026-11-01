import type { TFunction } from 'i18next'
import type { EventClass, EventRotationGroup, EventStation, StationVisitLayout } from '../types'
import type { SortableRegistration } from './registration'
import { compareRegistrationClasses } from './event'
import {
  getRegistrationClass,
  getRegistrationGroupDay,
  getRegistrationPlacement,
  sortRegistrationsByDateClassTimeAndNumber,
} from './registration'

/**
 * The rotation of a trial day (KOE-1665): the posts are fixed and the groups pass them, each a class or
 * a range of its start numbers, each in its own order. A day without any group of its own runs every
 * class through the day's posts in number order, which is how every trial ran before.
 *
 * This module answers where a dog goes and in which order the groups reach a post. What a task is worth
 * and what the dog scored are `results.ts`'s, which reads the visits from here.
 */

/** The parts a post's tasks split into. The only reader of the name rows stored before KOE-1665 use. */
export const stationParts = (station: Pick<EventStation, 'parts' | 'tasks'>): 1 | 2 =>
  station.parts ?? station.tasks ?? 1

/** How many tasks a group does at a post unless its rotation says otherwise. */
export const stationTaskCount = (station: Pick<EventStation, 'taskCount'>): number => station.taskCount ?? 1

/** The splits a post's task takes: whole, or two parts of 10. */
export const POST_PARTS: readonly (1 | 2)[] = [1, 2]

/** The tasks a group may do at one post. Three is room enough; a fourth would be a post of its own. */
export const POST_TASK_COUNTS: readonly number[] = [1, 2, 3]

export type RotationStation = Pick<EventStation, 'id' | 'number' | 'date' | 'parts' | 'tasks' | 'taskCount'>

/** What the rotation reads of an event. */
export interface RotationEvent {
  stations?: readonly RotationStation[]
  rotations?: readonly EventRotationGroup[]
  /** The classes of each day. A stored group of a class that is not on its day is not read. */
  classes?: readonly Pick<EventClass, 'class' | 'date'>[]
}

/** A dog as the rotation places it: its class, its day and its start number. */
export interface RotationDog {
  class?: string | null
  /** The trial day as a day key (`getRegistrationGroupDay`). */
  day: string
  number?: number
}

/**
 * One visit of a group to a post: what the group does there, the post's defaults resolved, and where in
 * its round the visit falls. The link is sent the `StationVisitLayout` part of it.
 */
interface RotationVisit extends StationVisitLayout {
  station: RotationStation
  /** 0-based position of the post in the group's round: the order the groups arrive in. */
  position: number
}

/**
 * A group as the readers see it. A stored group names one of the classes; the default group of a
 * classless type is named by its event type, as its dogs' class is (`getRegistrationClass`).
 */
type RotationGroup = Omit<EventRotationGroup, 'class'> & { class: string }

interface StationArrival extends RotationVisit {
  group: RotationGroup
}

type Registrationish = SortableRegistration

/** A registration's place in the rotation: the frozen placement wins over the working order. */
export const rotationDogOf = (registration: Registrationish): RotationDog => {
  const placement = getRegistrationPlacement(registration)
  return {
    class: getRegistrationClass(registration),
    day: getRegistrationGroupDay(placement?.date),
    number: placement?.number,
  }
}

/** A post's day as a key: compared through the formatter, never as the raw value. */
const stationDay = (station: Pick<EventStation, 'date'>): string => getRegistrationGroupDay(station.date)

/** The posts of one day, in number order. */
export const dayStations = (event: RotationEvent, day: string): RotationStation[] =>
  (event.stations ?? []).filter((station) => stationDay(station) === day).sort((a, b) => a.number - b.number)

const stationById = (event: RotationEvent, stationId: string) =>
  event.stations?.find((station) => station.id === stationId)

/** The day of a group: the day of its posts. Empty while it names no post the event has. */
export const rotationGroupDay = (event: RotationEvent, group: RotationGroup): string => {
  const station = group.posts.map((post) => stationById(event, post.stationId)).find(Boolean)
  return station ? stationDay(station) : ''
}

const classesOfDay = (event: RotationEvent, day: string): string[] =>
  [
    ...new Set(
      (event.classes ?? []).filter((item) => getRegistrationGroupDay(item.date) === day).map((item) => item.class)
    ),
  ].sort(compareRegistrationClasses)

/** Whether a stored group is read on a day: its posts are on that day and its class runs then. */
const readsOn = (event: RotationEvent, group: RotationGroup, day: string): boolean => {
  if (rotationGroupDay(event, group) !== day) return false
  const classes = classesOfDay(event, day)
  return classes.length === 0 || classes.includes(group.class)
}

/** The stored groups of one class on one day, in start number order. */
const storedGroupsOf = (event: RotationEvent, eventClass: string | null | undefined, day: string) =>
  (event.rotations ?? [])
    .filter((group) => group.class === eventClass && readsOn(event, group, day))
    .sort((a, b) => (a.firstNumber ?? 0) - (b.firstNumber ?? 0))

/** The group of a class with none of its own: the day's posts in number order, as laid out. */
const defaultGroup = (event: RotationEvent, eventClass: string, day: string): RotationGroup => ({
  class: eventClass,
  posts: dayStations(event, day).map((station) => ({ stationId: station.id })),
})

/**
 * The group among a class's ranged groups a number falls in, or the nearest: a dog whose number is in
 * no range still has to be scored somewhere. Above the last range it goes with the last group, below
 * the first with the first, in a gap with the group below. No number counts as below everything.
 */
const nearestGroup = (groups: readonly RotationGroup[], number: number | undefined): RotationGroup => {
  if (number === undefined) return groups[0]
  let nearest = groups[0]
  for (const group of groups) {
    if ((group.firstNumber ?? 0) <= number) nearest = group
  }
  return nearest
}

/** The group a dog belongs to on its day. Every dog has one. */
export const rotationGroupOf = (event: RotationEvent, dog: RotationDog): RotationGroup => {
  const eventClass = dog.class ?? ''
  const groups = storedGroupsOf(event, eventClass, dog.day)
  if (groups.length === 0) return defaultGroup(event, eventClass, dog.day)
  return nearestGroup(groups, dog.number)
}

/** Every group of a day, stored or default, in class order and then start number order. */
export const rotationGroupsOfDay = (event: RotationEvent, day: string): RotationGroup[] => {
  const classes = new Set<string>(classesOfDay(event, day))
  for (const group of event.rotations ?? []) {
    if (readsOn(event, group, day)) classes.add(group.class)
  }

  return [...classes].sort(compareRegistrationClasses).flatMap((eventClass) => {
    const stored = storedGroupsOf(event, eventClass, day)
    return stored.length ? stored : [defaultGroup(event, eventClass, day)]
  })
}

/**
 * A group's posts in its own order, with the post's defaults filled in and the tasks it does before each.
 * A post the event lacks is skipped.
 */
const groupVisits = (event: RotationEvent, group: RotationGroup): RotationVisit[] => {
  const visits: RotationVisit[] = []
  let tasksBefore = 0
  for (const post of group.posts) {
    const station = stationById(event, post.stationId)
    if (!station) continue
    const tasks = post.taskCount ?? stationTaskCount(station)
    visits.push({ parts: post.parts ?? stationParts(station), position: visits.length, station, tasks, tasksBefore })
    tasksBefore += tasks
  }
  return visits
}

/** A dog's posts on its day, in the order its group visits them. */
export const dogVisits = (event: RotationEvent, dog: RotationDog): RotationVisit[] =>
  groupVisits(event, rotationGroupOf(event, dog))

/** A group's visit to one post, or undefined when the group does not go there. */
const groupStationVisit = (event: RotationEvent, group: RotationGroup, stationId: string): RotationVisit | undefined =>
  groupVisits(event, group).find((visit) => visit.station.id === stationId)

/** Arrival order at a post: the post's place in the group's round, then class, then start number. */
const compareArrivals = (a: StationArrival, b: StationArrival) =>
  a.position - b.position ||
  compareRegistrationClasses(a.group.class, b.group.class) ||
  (a.group.firstNumber ?? 0) - (b.group.firstNumber ?? 0)

/**
 * The groups that visit a post, in the order they reach it: by the post's place in each group's round,
 * then class, then start number. Without a rotation every class is at its first post together, so the
 * order is the class order, as it always was.
 */
export const stationArrivals = (event: RotationEvent, stationId: string): StationArrival[] => {
  const station = stationById(event, stationId)
  if (!station) return []

  return rotationGroupsOfDay(event, stationDay(station))
    .flatMap((group) => {
      const visit = groupStationVisit(event, group, stationId)
      return visit ? [{ ...visit, group }] : []
    })
    .sort(compareArrivals)
}

/**
 * The dogs that come to a post, in the order their groups reach it and, within a group, in start order,
 * each with what its group does there. A dog whose group does not visit the post, a dog of another day
 * among them, is not in the queue. The station link and the secretary's view of a post read the same
 * queue.
 */
export const stationQueue = <T extends Registrationish>(
  event: RotationEvent,
  stationId: string,
  registrations: readonly T[]
): { registration: T; visit: StationVisitLayout }[] =>
  registrations
    .flatMap((registration) => {
      const group = rotationGroupOf(event, rotationDogOf(registration))
      const visit = groupStationVisit(event, group, stationId)
      return visit ? [{ arrival: { ...visit, group }, registration }] : []
    })
    .sort(
      (a, b) =>
        compareArrivals(a.arrival, b.arrival) ||
        sortRegistrationsByDateClassTimeAndNumber(a.registration, b.registration)
    )
    .map(({ arrival: { parts, tasks, tasksBefore }, registration }) => ({
      registration,
      visit: { parts, tasks, tasksBefore },
    }))

/** Why a stored rotation cannot be read. `group` is the index in `rotations`. */
type RotationShapeError =
  | { kind: 'noPosts'; group: number }
  | { kind: 'range'; group: number }
  | { kind: 'unknownPost'; group: number; stationId: string }
  | { kind: 'postTwice'; group: number; stationId: string }
  | { kind: 'mixedDays'; group: number }
  | { kind: 'overlap'; group: number; other: number }

const postErrors = (event: RotationEvent, group: EventRotationGroup, index: number): RotationShapeError[] => {
  if (group.posts.length === 0) return [{ group: index, kind: 'noPosts' }]

  const errors: RotationShapeError[] = []
  const seen = new Set<string>()
  const days = new Set<string>()
  for (const post of group.posts) {
    const station = stationById(event, post.stationId)
    if (!station) errors.push({ group: index, kind: 'unknownPost', stationId: post.stationId })
    else days.add(stationDay(station))
    if (seen.has(post.stationId)) errors.push({ group: index, kind: 'postTwice', stationId: post.stationId })
    seen.add(post.stationId)
  }
  if (days.size > 1) errors.push({ group: index, kind: 'mixedDays' })
  return errors
}

/** A range is both numbers or neither, the first not after the last. */
const rangeIsWhole = ({ firstNumber, lastNumber }: RotationGroup): boolean =>
  firstNumber === undefined || lastNumber === undefined ? firstNumber === lastNumber : firstNumber <= lastNumber

/** The numbers a group holds; a group without a range holds them all. */
const rangeOf = (group: RotationGroup): [number, number] => [
  group.firstNumber ?? Number.NEGATIVE_INFINITY,
  group.lastNumber ?? Number.POSITIVE_INFINITY,
]

const overlaps = (a: RotationGroup, b: RotationGroup): boolean => {
  const [aFirst, aLast] = rangeOf(a)
  const [bFirst, bLast] = rangeOf(b)
  return aFirst <= bLast && bFirst <= aLast
}

/**
 * What makes a stored rotation unreadable: a group with no posts, a post the event does not have, the
 * same post twice in one round, posts of different days in one group, or two groups of one class and
 * day sharing a number. A group without a range holds every number, so it may not share its class and
 * day with any other group. A range is both numbers or neither, the first not after the last; the
 * request schema refuses the same, and this says it to the Rastit page before anything is sent.
 */
export const rotationShapeErrors = (event: RotationEvent): RotationShapeError[] => {
  const rotations = event.rotations ?? []
  const errors = rotations.flatMap((group, index) => [
    ...(rangeIsWhole(group) ? [] : [{ group: index, kind: 'range' as const }]),
    ...postErrors(event, group, index),
  ])

  rotations.forEach((group, index) => {
    const day = rotationGroupDay(event, group)
    for (let other = index + 1; other < rotations.length; other++) {
      const candidate = rotations[other]
      if (candidate.class === group.class && rotationGroupDay(event, candidate) === day && overlaps(group, candidate)) {
        errors.push({ group: index, kind: 'overlap', other })
      }
    }
  })

  return errors
}

/** A dog the stored ranges of its class leave out: it is scored with the nearest group, but it should not be. */
interface RotationCoverageError {
  registrationId: string
  class: string
  day: string
  number: number
}

/**
 * The participants whose class splits into number ranges on their day but whose number falls in none
 * of them. The Rastit page refuses to save such a rotation; the server does not check it, since a number
 * drawn later can move a dog out of a range the page accepted. A dog without a number has no range to
 * miss: the nearest-group rule puts it with the first group.
 */
export const rotationCoverageErrors = (
  event: RotationEvent,
  registrations: readonly (Registrationish & { id: string })[]
): RotationCoverageError[] =>
  registrations.flatMap((registration) => {
    const { class: eventClass, day, number } = rotationDogOf(registration)
    if (number === undefined) return []
    const groups = storedGroupsOf(event, eventClass, day)
    if (groups.length === 0 || groups.some((group) => group.firstNumber === undefined)) return []

    const covered = groups.some((group) => (group.firstNumber ?? 0) <= number && number <= (group.lastNumber ?? 0))
    return covered ? [] : [{ class: eventClass ?? '', day, number, registrationId: registration.id }]
  })

/** A group as the secretary and the handlers read it: its class, and its start numbers where it has a range. */
export const formatRotationGroup = (group: RotationGroup, t: TFunction<'translation'>): string =>
  group.firstNumber === undefined || group.lastNumber === undefined
    ? group.class
    : t('event.rotation.group', { eventClass: group.class, first: group.firstNumber, last: group.lastNumber })

/** What a group does at a post beyond one whole task: "(x 2)", "(2 osaa)", or nothing. */
const formatVisitExtent = (
  { tasks, parts }: Pick<StationVisitLayout, 'tasks' | 'parts'>,
  t: TFunction<'translation'>
) => {
  const extent = [
    ...(tasks > 1 ? [t('event.rotation.tasks', { count: tasks })] : []),
    ...(parts > 1 ? [t('event.rotation.parts', { count: parts })] : []),
  ]
  return extent.length ? ` (${extent.join(', ')})` : ''
}

/**
 * A post as its own sheet reads: the groups in the order they reach it, with what each does there beyond
 * one whole task. "Rasti 1: ALO, AVO, VOI (x 2)". Derived from the rotation, never stored.
 */
export const formatStationArrivals = (
  event: RotationEvent,
  station: Pick<EventStation, 'id' | 'number'>,
  t: TFunction<'translation'>
): string =>
  t('event.rotation.postSummary', {
    groups: stationArrivals(event, station.id)
      .map((arrival) => `${formatRotationGroup(arrival.group, t)}${formatVisitExtent(arrival, t)}`)
      .join(', '),
    number: station.number,
  })

/**
 * A group's round as the start list reads it: where it starts and in which order it goes round,
 * "ALO: aloittaa rastilta 1, kiertää rastit 1, 2, 3 (x 2)".
 */
const formatRotationRound = (event: RotationEvent, group: RotationGroup, t: TFunction<'translation'>): string => {
  const visits = groupVisits(event, group)
  const order = visits.map((visit) => `${visit.station.number}${formatVisitExtent(visit, t)}`).join(', ')
  return t('event.rotation.startLine', {
    group: formatRotationGroup(group, t),
    order,
    start: visits[0]?.station.number,
  })
}

/**
 * The rotation lines a start list shows under a class on a day: one per group the secretary laid out,
 * none where the day runs in number order as it always has. A range names start numbers, so a group
 * of one is shown only once the class's numbers are out.
 */
export const rotationStartLines = (
  event: RotationEvent,
  eventClass: string,
  day: string,
  numbersPublished: boolean,
  t: TFunction<'translation'>
): string[] =>
  storedGroupsOf(event, eventClass, day)
    .filter((group) => numbersPublished || group.firstNumber === undefined)
    .map((group) => formatRotationRound(event, group, t))
