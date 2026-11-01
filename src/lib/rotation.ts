import type { TFunction } from 'i18next'
import type {
  EventClass,
  EventExercise,
  EventRotationGroup,
  EventStation,
  RegistrationClass,
  StationVisitLayout,
} from '../types'
import type { SortableRegistration } from './registration'
import { compareRegistrationClasses } from './event'
import { stationDogsAtOnce } from './liveFormat'
import {
  getRegistrationClass,
  getRegistrationGroupDay,
  getRegistrationPlacement,
  sortRegistrationsByDateClassTimeAndNumber,
} from './registration'

/**
 * The running orders of a trial day (KOE-1665): the posts are fixed and the groups pass them, each a
 * class or a range of its start numbers, each with its own running order of exercises. An exercise is
 * the rules' rasti, one 20-point performance at a post; a group may do two in a row at one post. A day
 * without any group of its own runs every class through one exercise at each post in number order,
 * which is how every trial ran before.
 *
 * This module answers where a dog goes, which exercise it does where and in which order the groups
 * reach a post. What an exercise is worth and what the dog scored are `results.ts`'s, which reads the
 * visits from here.
 */

/** The parts a post's exercises split into. The only reader of the name rows stored before KOE-1665 use. */
export const stationParts = (station: Pick<EventStation, 'parts' | 'tasks'>): 1 | 2 =>
  station.parts ?? station.tasks ?? 1

/** The splits an exercise takes: whole, or two parts of 10. */
export const POST_PARTS: readonly (1 | 2)[] = [1, 2]

/** A work test has four or five exercises; another count is warned of, never refused. */
const USUAL_EXERCISE_COUNTS = new Set([4, 5])

export type RotationStation = Pick<EventStation, 'id' | 'number' | 'date' | 'parts' | 'tasks' | 'dogsAtOnce'>

/** What an exercise does at its post, every figure given: its own or the post's default. */
export interface ExerciseSettings {
  parts: 1 | 2
  dogsAtOnce: number
}

/** A post's own dogs at once as an exercise compares with it, read as the turns read it; no format fixes it here. */
const stationDogs = (station: Pick<EventStation, 'dogsAtOnce'>): number => stationDogsAtOnce(undefined, station)

/** What an exercise does at its post, the post's defaults filled in where the exercise sets nothing. */
export const exerciseSettingsOf = (
  station: Pick<EventStation, 'parts' | 'tasks' | 'dogsAtOnce'>,
  exercise: Omit<EventExercise, 'stationId'> = {}
): ExerciseSettings => ({
  dogsAtOnce: exercise.dogsAtOnce ?? stationDogs(station),
  parts: exercise.parts ?? stationParts(station),
})

/**
 * An exercise as a group stores it. A value equal to the post's own default is left out, so the
 * exercise follows the post when its default changes later.
 */
export const exerciseOf = (
  station: Pick<EventStation, 'id' | 'parts' | 'tasks' | 'dogsAtOnce'>,
  { parts, dogsAtOnce }: ExerciseSettings
): EventExercise => ({
  stationId: station.id,
  ...(parts === stationParts(station) ? {} : { parts }),
  ...(dogsAtOnce === stationDogs(station) ? {} : { dogsAtOnce }),
})

/** A group's running order. A group stored before the exercises (dev only, as `posts`) has none. */
export const groupExercises = (group: Pick<EventRotationGroup, 'exercises'>): EventExercise[] => group.exercises ?? []

/**
 * An exercise moved from one post to another, keeping what it shows: its parts and dogs at once are read
 * off the old post, its defaults included, and stored against the new one.
 */
export const moveExercise = (
  from: Pick<EventStation, 'parts' | 'tasks' | 'dogsAtOnce'>,
  to: Pick<EventStation, 'id' | 'parts' | 'tasks' | 'dogsAtOnce'>,
  exercise: Omit<EventExercise, 'stationId'>
): EventExercise => exerciseOf(to, exerciseSettingsOf(from, exercise))

/** What the rotation reads of an event. */
export interface RotationEvent {
  stations?: readonly RotationStation[]
  rotations?: readonly EventRotationGroup[]
  /** The classes of each day. A stored group of a class that is not on its day is not read. */
  classes?: readonly Pick<EventClass, 'class' | 'date'>[]
}

/**
 * What of an event decides the dogs' rounds, and nothing else: a post's judges, its link token or its
 * phases change no round, so an event save that changes only those reads no registration (KOE-1666).
 * Neither does how many dogs a post or an exercise takes at once: it changes no round and no score.
 */
export const roundInputsOf = (event: RotationEvent) => ({
  classes: (event.classes ?? []).map((item) => ({ class: item.class, day: getRegistrationGroupDay(item.date) })),
  rotations: (event.rotations ?? []).map((group) => ({
    class: group.class,
    exercises: groupExercises(group).map(({ dogsAtOnce: _dogs, ...exercise }) => exercise),
    firstNumber: group.firstNumber,
    lastNumber: group.lastNumber,
  })),
  stations: (event.stations ?? []).map((station) => ({
    day: stationDay(station),
    id: station.id,
    number: station.number,
    parts: stationParts(station),
  })),
})

/** A dog as the rotation places it: its class, its day and its start number. */
export interface RotationDog {
  class?: string | null
  /** The trial day as a day key (`getRegistrationGroupDay`). */
  day: string
  number?: number
}

/**
 * One visit of a group to a post: one exercise of its running order, the post's defaults resolved. The
 * link is sent the `StationVisitLayout` part of it.
 */
interface RotationVisit extends StationVisitLayout {
  station: RotationStation
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
export const rotationGroupDay = (event: RotationEvent, group: Pick<EventRotationGroup, 'exercises'>): string => {
  const station = groupExercises(group)
    .map((exercise) => stationById(event, exercise.stationId))
    .find(Boolean)
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

/** One exercise at each of the day's posts, in number order: a class without a group of its own. */
const oneExerciseEach = (stations: readonly RotationStation[]): EventExercise[] =>
  stations.map((station) => ({ stationId: station.id }))

/** The group of a class with none of its own: one exercise at each of the day's posts, as laid out. */
const defaultGroup = (event: RotationEvent, eventClass: string, day: string): RotationGroup => ({
  class: eventClass,
  exercises: oneExerciseEach(dayStations(event, day)),
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
 * A group's visits to the posts in its running order, one per exercise (Jukka 1.11.2026): the exercises
 * numbered across the whole order, the post's defaults filled in, and each one's first slot at its post
 * counted over the group's exercises there before it. An exercise at a post the event lacks is skipped
 * and not numbered.
 */
const groupVisits = (event: RotationEvent, group: RotationGroup): RotationVisit[] => {
  const visits: RotationVisit[] = []
  const slotsAt = new Map<string, number>()
  for (const exercise of groupExercises(group)) {
    const station = stationById(event, exercise.stationId)
    if (!station) continue
    const parts = exercise.parts ?? stationParts(station)
    const slotsBefore = slotsAt.get(station.id) ?? 0
    slotsAt.set(station.id, slotsBefore + parts)
    const dogsAtOnce = exercise.dogsAtOnce ?? station.dogsAtOnce
    visits.push({
      exercise: visits.length + 1,
      parts,
      slotsBefore,
      station,
      ...(dogsAtOnce === undefined ? {} : { dogsAtOnce }),
    })
  }
  return visits
}

/** A dog's visits on its day, in its group's running order. */
export const dogVisits = (event: RotationEvent, dog: RotationDog): RotationVisit[] =>
  groupVisits(event, rotationGroupOf(event, dog))

/** A group's visits to one post, one per exercise it does there, in exercise order. */
const groupStationVisits = (event: RotationEvent, group: RotationGroup, stationId: string): RotationVisit[] =>
  groupVisits(event, group).filter((visit) => visit.station.id === stationId)

/** Arrival order at a post: the exercise number, then class, then start number. */
const compareArrivals = (a: StationArrival, b: StationArrival) =>
  a.exercise - b.exercise ||
  compareRegistrationClasses(a.group.class, b.group.class) ||
  (a.group.firstNumber ?? 0) - (b.group.firstNumber ?? 0)

/** A group's visits to a post as arrivals: each exercise it does there, with the group. */
const arrivalsOf = (event: RotationEvent, group: RotationGroup, stationId: string): StationArrival[] =>
  groupStationVisits(event, group, stationId).map((visit) => ({ ...visit, group }))

/**
 * The visits to a post, in the order they come: by exercise number, then class, then start number. A
 * group doing two exercises at the post comes twice, all its dogs for the first before any for the
 * second. Without a running order every class is at its first post together, so the order is the class
 * order, as it always was.
 */
export const stationArrivals = (event: RotationEvent, stationId: string): StationArrival[] => {
  const station = stationById(event, stationId)
  if (!station) return []

  return rotationGroupsOfDay(event, stationDay(station))
    .flatMap((group) => arrivalsOf(event, group, stationId))
    .sort(compareArrivals)
}

/** What the link is sent of a visit: the layout, without the post. */
const visitLayoutOf = ({ exercise, parts, slotsBefore, dogsAtOnce }: RotationVisit): StationVisitLayout => ({
  exercise,
  parts,
  slotsBefore,
  ...(dogsAtOnce === undefined ? {} : { dogsAtOnce }),
})

/** A visit told apart from the others to its post: the group's class, where its range starts, the exercise. */
const arrivalKey = (arrival: StationArrival) =>
  `${arrival.group.class}#${arrival.group.firstNumber ?? ''}#${arrival.exercise}`

/**
 * A post's queue (Jukka 1.11.2026): one entry per visit, a group's exercise there, in the order they come
 * (`stationArrivals`), each holding the group's dogs in start order with what they do. A dog whose group
 * does not visit the post, a dog of another day among them, is not in the queue; a dog whose group does
 * two exercises there is in it twice.
 *
 * A dog is placed by its start number. Where a class is split into number ranges and its numbers are
 * not out yet (the public start list before they are published), every dog of the class is placed with
 * its first range's group, and that group stands for the whole class.
 */
export const stationQueueEntries = <T extends Registrationish>(
  event: RotationEvent,
  stationId: string,
  registrations: readonly T[]
): { registrations: T[]; visit: StationVisitLayout }[] => {
  const arrivals = registrations
    .flatMap((registration) =>
      arrivalsOf(event, rotationGroupOf(event, rotationDogOf(registration)), stationId).map((arrival) => ({
        arrival,
        registration,
      }))
    )
    .sort(
      (a, b) =>
        compareArrivals(a.arrival, b.arrival) ||
        sortRegistrationsByDateClassTimeAndNumber(a.registration, b.registration)
    )

  const entries: { key: string; registrations: T[]; visit: StationVisitLayout }[] = []
  for (const { arrival, registration } of arrivals) {
    const key = arrivalKey(arrival)
    const last = entries.at(-1)
    if (last?.key === key) last.registrations.push(registration)
    else entries.push({ key, registrations: [registration], visit: visitLayoutOf(arrival) })
  }
  return entries.map(({ registrations: dogs, visit }) => ({ registrations: dogs, visit }))
}

/**
 * The dogs that come to a post, entry by entry (`stationQueueEntries`), each with the exercise it does
 * there. The station link and the secretary's view of a post read the same queue.
 */
export const stationQueue = <T extends Registrationish>(
  event: RotationEvent,
  stationId: string,
  registrations: readonly T[]
): { registration: T; visit: StationVisitLayout }[] =>
  stationQueueEntries(event, stationId, registrations).flatMap(({ registrations: dogs, visit }) =>
    dogs.map((registration) => ({ registration, visit }))
  )

/** The runs of a running order: the exercises a group does at one post in a row, its post and how many. */
const runsOf = (exercises: readonly EventExercise[]): { stationId: string; length: number }[] => {
  const runs: { stationId: string; length: number }[] = []
  for (const exercise of exercises) {
    const last = runs.at(-1)
    if (last?.stationId === exercise.stationId) last.length += 1
    else runs.push({ length: 1, stationId: exercise.stationId })
  }
  return runs
}

/**
 * The group a secretary adds next on a day (KOE-1665). The groups usually all go round the same way, so
 * it follows the day's last group, one post on: the posts move over the runs, not over the exercises, so
 * a post repeated in a row stays in a row (1, 2, 3, 3 gives 2, 3, 1, 1). An exercise keeps its parts and
 * dogs at once with its number; they are read off the old post and stored against the new one. The
 * class is the first of the day without a group; once every class has one, the previous group's, its
 * range going on from the previous range. The day's first group does one exercise at each post in
 * number order.
 *
 * `stations` are the day's posts in number order, `dayGroups` the stored groups of the day in list order.
 */
export const nextRotationGroup = (
  stations: readonly RotationStation[],
  classes: readonly RegistrationClass[],
  dayGroups: readonly EventRotationGroup[]
): EventRotationGroup & { exercises: EventExercise[] } => {
  const withoutGroup = classes.find((item) => !dayGroups.some((group) => group.class === item))
  const previous = dayGroups.at(-1)
  if (!previous) return { class: withoutGroup ?? classes[0], exercises: oneExerciseEach(stations) }

  const stationOf = (stationId: string) => stations.find((station) => station.id === stationId)
  const previousExercises = groupExercises(previous)
  const runs = runsOf(previousExercises)
  const movedTo = runs.flatMap((run, at) =>
    Array.from({ length: run.length }, () => runs[(at + 1) % runs.length].stationId)
  )
  const exercises = previousExercises.flatMap((exercise, at) => {
    const from = stationOf(exercise.stationId)
    const to = stationOf(movedTo[at])
    return from && to ? [moveExercise(from, to, exercise)] : []
  })

  if (withoutGroup) return { class: withoutGroup, exercises }
  return {
    class: previous.class,
    exercises,
    ...(previous.lastNumber === undefined ? {} : { firstNumber: previous.lastNumber + 1 }),
  }
}

/** Why a stored rotation cannot be read. `group` is the index in `rotations`. */
type RotationShapeError =
  | { kind: 'noExercises'; group: number }
  | { kind: 'range'; group: number }
  | { kind: 'unknownPost'; group: number; stationId: string }
  | { kind: 'mixedDays'; group: number }
  | { kind: 'overlap'; group: number; other: number }

const exerciseErrors = (event: RotationEvent, group: EventRotationGroup, index: number): RotationShapeError[] => {
  const exercises = groupExercises(group)
  if (exercises.length === 0) return [{ group: index, kind: 'noExercises' }]

  const errors: RotationShapeError[] = []
  const days = new Set<string>()
  for (const exercise of exercises) {
    const station = stationById(event, exercise.stationId)
    if (station) days.add(stationDay(station))
    else errors.push({ group: index, kind: 'unknownPost', stationId: exercise.stationId })
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
 * What makes a stored running order unreadable: a group with no exercises, a post the event does not
 * have, posts of different days in one group, or two groups of one class and day sharing a number. A
 * post may come more than once, in a row or apart (Jukka 1.11.2026). A group without a range holds every
 * number, so it may not share its class and day with any other group. A range is both numbers or
 * neither, the first not after the last. The posts page and the event save read this same rule.
 */
export const rotationShapeErrors = (event: RotationEvent): RotationShapeError[] => {
  const rotations = event.rotations ?? []
  const errors = rotations.flatMap((group, index) => [
    ...(rangeIsWhole(group) ? [] : [{ group: index, kind: 'range' as const }]),
    ...exerciseErrors(event, group, index),
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

/**
 * What the posts page warns of without refusing it: a group's running order of other than four or five
 * exercises. `group` is the index in `rotations`.
 */
interface RotationWarning {
  group: number
  count: number
}

/** The groups whose running order has other than the four or five exercises a work test has. */
export const rotationWarnings = (event: Pick<RotationEvent, 'rotations'>): RotationWarning[] =>
  (event.rotations ?? []).flatMap((group, index) => {
    const count = groupExercises(group).length
    return count === 0 || USUAL_EXERCISE_COUNTS.has(count) ? [] : [{ count, group: index }]
  })

/** A dog the stored ranges of its class leave out: it is scored with the nearest group, but it should not be. */
interface RotationCoverageError {
  registrationId: string
  class: string
  day: string
  number: number
}

/**
 * The participants whose class splits into number ranges on their day but whose number falls in none
 * of them. The posts page refuses to save such a running order; the server does not check it, since a number
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

/** The exercises of a group's visits in a row as a post's sheet names them: "rasti 1", "rastit 3 ja 4". */
const formatExercises = (numbers: readonly number[], split: boolean, t: TFunction<'translation'>) => {
  const named =
    numbers.length === 1
      ? t('event.rotation.exerciseOne', { number: numbers[0] })
      : t('event.rotation.exerciseMany', { last: numbers.at(-1), list: numbers.slice(0, -1).join(', ') })
  return split ? `${named}, ${t('event.rotation.parts', { count: 2 })}` : named
}

/** A post's arrivals with a group's visits in a row taken together: "VOI (rastit 3 ja 4)". */
const arrivalRuns = (arrivals: readonly StationArrival[]) => {
  const runs: { group: RotationGroup; numbers: number[]; split: boolean }[] = []
  for (const arrival of arrivals) {
    const last = runs.at(-1)
    if (last?.group === arrival.group) {
      last.numbers.push(arrival.exercise)
      last.split ||= arrival.parts > 1
    } else {
      runs.push({ group: arrival.group, numbers: [arrival.exercise], split: arrival.parts > 1 })
    }
  }
  return runs
}

/**
 * A post as its own sheet reads: the visits in the order they come, a group's visits in a row together. "Suorituspaikka 1: ALO (rasti 1), AVO (rasti 2), VOI (rastit 3 ja 4)". Derived, never stored.
 */
export const formatStationArrivals = (
  event: RotationEvent,
  station: Pick<EventStation, 'id' | 'number'>,
  t: TFunction<'translation'>
): string =>
  t('event.rotation.postSummary', {
    groups: arrivalRuns(stationArrivals(event, station.id))
      .map((run) => `${formatRotationGroup(run.group, t)} (${formatExercises(run.numbers, run.split, t)})`)
      .join(', '),
    number: station.number,
  })

/** A group's running order as the start list reads it, as posts: "ALO: suorituspaikat 1, 2, 3, 3". */
const formatRotationRound = (event: RotationEvent, group: RotationGroup, t: TFunction<'translation'>): string =>
  t('event.rotation.startLine', {
    group: formatRotationGroup(group, t),
    order: groupVisits(event, group)
      .map((visit) => visit.station.number)
      .join(', '),
  })

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
