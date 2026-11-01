import type { TFunction } from 'i18next'
import type {
  EliminatingFault,
  EventResultElimination,
  EventResultRetirement,
  JsonEventResult,
  JsonEventResultTask,
  JsonRegistration,
  NowtZeroFault,
  PublicJudge,
  Registration,
  ResultMark,
  StationVisitLayout,
} from '../types'
import type { SortableRegistration } from './registration'
import type { RotationDog, RotationEvent } from './rotation'
import { objectsDiffer } from './diff'
import {
  getRegistrationClass,
  getRegistrationGroupDay,
  getRegistrationPlacement,
  isScorableRegistration,
  sortRegistrationsByDateClassTimeAndNumber,
} from './registration'
import { dogVisits, stationQueue } from './rotation'
import { isObject } from './utils'

/**
 * The result codes shared by every event type. `0` and `-` are different outcomes: `0` says the dog was
 * judged and did not place, `-` says there was no completed round to judge. Both differ again from an
 * absent result, which says nothing has been recorded yet.
 */
export type ResultCode = '1' | '2' | '3' | '0' | '-'

/**
 * The marks published beside a result (KOE-1300).
 *
 * The rules say what a stopped dog's result line reads — a nought, see `STOPPED_RESULT_CODE` — but a
 * nought is also what a dog that simply failed to place gets, and NOME-B §4.3.3 requires more than that:
 * "Keskeyttämisen syy ja se, kenen toimesta keskeyttäminen on tapahtunut, merkitään arvosteluun." The
 * mark carries the second half of that beside the code, the way Koiranet carries it in "Lisämerkinnät"
 * rather than inside the result. (The first half — the reason — is KOE-1299.)
 *
 * Derived rather than entered: the secretary records what happened, and the mark follows.
 */
export const resultMarks = (result?: { retirement?: EventResultRetirement }): ResultMark[] =>
  result?.retirement?.cause === 'judgeStopped' ? ['interrupted'] : []

/** The marks as one reader-facing string, for wherever the result itself is spelled out. */
export const formatResultMarks = (marks: readonly ResultMark[] | undefined, t: TFunction<'translation'>): string =>
  (marks ?? []).map((mark) => t(`results.marks.${mark}`)).join(' ')

/**
 * The result as it is read out beside a dog: the code, the marks it carries and the placement, each
 * only where there is one. One line for the screen and the copied text alike.
 */
export const formatResultLine = (
  { marks, placement, result }: { marks?: readonly ResultMark[]; placement?: number; result?: string },
  t: TFunction<'translation'>
): string =>
  [result, formatResultMarks(marks, t), placement ? t('results.placement', { placement }) : '']
    .filter(Boolean)
    .join(' ')

/**
 * Prize thresholds as percentages of the round's maximum (NOWT rules §5.4.1).
 *
 * The rules print these as the absolute points 80 / 65 / 50, but that is the same percentage against a
 * five-post round. Events now commonly run four posts for a maximum of 80, where a dog on 65 points has
 * 81 % and has earned a *first* prize — comparing raw points would score it a second.
 */
const NOWT_PRIZE_THRESHOLD_PERCENT = { 1: 80, 2: 65, 3: 50 } as const

/**
 * A task is always worth 20, whether it is scored whole or in two parts of 10. §5.3.1 says it of a post
 * ("Jokaisen rastin enimmäispistemäärä on 20 pistettä"); in practice a group may do two tasks at one
 * post, and each is a task of 20, so a post is worth its tasks times 20 (KOE-1665).
 */
const TASK_MAX_POINTS = 20

/** A task's points split evenly between its parts, so the parts always add up to the task. */
export const partMaxPoints = (parts: 1 | 2): number => TASK_MAX_POINTS / parts

/** Event types scored at posts. Everything else is judged qualitatively and has no tasks. */
const POST_SCORED_EVENT_TYPES = new Set(['NOWT', 'NOWT SM'])

export const scoresAtPosts = (eventType?: string): boolean => POST_SCORED_EVENT_TYPES.has(eventType ?? '')

/**
 * The formats in which a judge's stop is recorded at all. This mirrors the `keskeytys` rows of
 * Kennelliitto's Koemuoto/Lue/Tulokset (src/lambda/lib/KLIntegraatio-fixtures/koemuoto-*.json): NKM,
 * NOME-A, NOME-B and NOWT list one, NOU lists only NOU1 and NOU0, so a taipumuskoe is never stopped
 * (KOE-1643). The entry screen reads this list because it has no koemuoto at hand; the write to
 * Kennelliitto still checks the live answer (`formatAllowsStop`). A format not listed here offers no
 * stop until someone adds it.
 */
const JUDGE_STOP_FORMATS = new Set(['NKM', 'NOME-A', 'NOME-B', 'NOWT'])

/**
 * NOWT §5.3.5, in the order the list gives them, plus §5.4.1's stop for disciplining the dog. Luvaton
 * lähtö, karkaaminen and vinkuminen only zero a task here (§5.3.4, `NowtZeroFault`), so they are absent
 * on purpose.
 */
const NOWT_ELIMINATING_FAULTS: readonly EliminatingFault[] = [
  'aggression',
  'gunShyness',
  'excessiveShyness',
  'hardMouth',
  'harshHandling',
]

/** NOME-A §3.3.3, hylkäävät virheet, in the order the list gives them. */
const NOME_A_ELIMINATING_FAULTS: readonly EliminatingFault[] = [
  'aggression',
  'gunShyness',
  'excessiveShyness',
  'noise',
  'refusedWater',
  'refusedGame',
  'hardMouth',
  'swappedGame',
  'chasedUnshotGame',
  'huntingWithGame',
  'unauthorizedRun',
  'physicalContact',
  'outOfControl',
]

/**
 * NOME-B §4.3.3, the reasons a judge stops a dog's trial, in the order the list gives them, with the
 * cooperation failure the section's opening sentence names before the list. NKM is judged by NOME-B's
 * VOI rules (§6.3) and shares it.
 */
const NOME_B_ELIMINATING_FAULTS: readonly EliminatingFault[] = [
  'aggression',
  'excessiveShyness',
  'noise',
  'gunShyness',
  'noDrive',
  'refusedWater',
  'refusedRetrieve',
  'refusedGame',
  'hardMouth',
  'huntingWithGame',
  'swappedGame',
  'unauthorizedRun',
  'outOfControl',
  'lacksCooperation',
]

/**
 * The taipumuskoe has no fault list: §2.3.2 names, quality by quality, what fails the dog, and §2.4 has
 * the main reason recorded when several qualities fail. These are those failures, in the order the
 * qualities are given.
 */
const NOU_ELIMINATING_FAULTS: readonly EliminatingFault[] = [
  'excessiveShyness',
  'aggression',
  'noise',
  'overExcitement',
  'refusedWater',
  'noDrive',
  'marking',
  'refusedRetrieve',
  'hardMouth',
  'refusedGame',
  'gunShyness',
  'lacksIndependence',
  'lacksCooperation',
]

const ELIMINATING_FAULTS_BY_EVENT_TYPE = new Map<string, readonly EliminatingFault[]>([
  ['NKM', NOME_B_ELIMINATING_FAULTS],
  ['NOME-A', NOME_A_ELIMINATING_FAULTS],
  ['NOME-A SM', NOME_A_ELIMINATING_FAULTS],
  ['NOME-B', NOME_B_ELIMINATING_FAULTS],
  ['NOME-B SM', NOME_B_ELIMINATING_FAULTS],
  ['NOU', NOU_ELIMINATING_FAULTS],
  ['NOWT', NOWT_ELIMINATING_FAULTS],
  ['NOWT SM', NOWT_ELIMINATING_FAULTS],
])

/** What every list agrees on, for an event type whose rules this module does not know. */
const COMMON_ELIMINATING_FAULTS: readonly EliminatingFault[] = [
  'aggression',
  'gunShyness',
  'excessiveShyness',
  'hardMouth',
]

/**
 * The faults a judge may end a dog's trial on, for an event type — each format's own list from the
 * rules edition in force (15.4.2023), since the lists differ: the same act is a hylkäävä virhe in
 * NOME-A, a keskeytyssyy in NOME-B, and a task-zeroing fault in NOWT.
 */
export const eliminatingFaults = (eventType?: string): readonly EliminatingFault[] =>
  ELIMINATING_FAULTS_BY_EVENT_TYPE.get(eventType ?? '') ?? COMMON_ELIMINATING_FAULTS

/**
 * Every zero-fault code, in the order the menu offers them, and for validating a submission's claim at
 * the write boundary. `unknown` comes last, after the rules' own faults (KOE-1664).
 */
export const nowtZeroFaults: readonly NowtZeroFault[] = [
  'unauthorizedRun',
  'outOfControl',
  'persistentNoise',
  'abandonedRetrieve',
  'refusedWater',
  'dummyNotFound',
  'huntingWithDummy',
  'swappedDummy',
  'eyeWipe',
  'unknown',
]

/** One part of a task as scored for one dog, joined to its definition in the dog's round. */
export interface ScoredTask {
  stationId: string
  /** 0-based task within the post. The parts of one task share it; the first-prize floor reads it. */
  task?: number
  /** The task's nominal maximum. Never the halved figure from an ALO recall. */
  maxPoints: number
  /** `null` while unscored. */
  points: number | null
}

interface NowtResultInput {
  tasks: readonly ScoredTask[]
  elimination?: EventResultElimination
  retirement?: EventResultRetirement
}

/**
 * The most this dog may score on a task. Calling the dog back mid-task halves it in ALO (§10.4).
 *
 * This caps what can be entered, not what the dog is measured against: the percentage stays over the
 * nominal maximum, so the forfeited points are the penalty. Scoring against this reduced ceiling instead
 * would erase the penalty entirely and hand out first prizes the rules disallow.
 */
export const taskEntryCeiling = (task: Pick<JsonEventResultTask, 'recalled'> & { maxPoints: number }): number =>
  task.recalled ? Math.floor(task.maxPoints / 2) : task.maxPoints

/** One scored slot in a dog's round: a task, or one part of a split task. */
export interface RoundTask {
  stationId: string
  /**
   * 0-based slot within the post, the address a stored score carries: task × parts + part. A post
   * stored before KOE-1665 with `tasks: 2` is one task in two parts, so its slots 0 and 1 read as before.
   */
  index: number
  /** 0-based task within the post. */
  task: number
  /** The task's number across the whole round, from 1, in the order the group does them. */
  taskNumber: number
  /** The parts the task splits into; the slot's part is `index % parts`. */
  parts: 1 | 2
  maxPoints: number
}

/**
 * The scored slots of one visit to a post: its tasks, each whole or in parts. Expanding the split here
 * rather than storing each slot means a task's parts cannot fail to add up to the task.
 */
export const stationSlots = (
  stationId: string,
  { tasks, parts, tasksBefore }: Pick<StationVisitLayout, 'tasks' | 'parts' | 'tasksBefore'>
): RoundTask[] =>
  Array.from({ length: tasks * parts }, (_unused, index) => {
    const task = Math.floor(index / parts)
    return { index, maxPoints: partMaxPoints(parts), parts, stationId, task, taskNumber: tasksBefore + task + 1 }
  })

/**
 * The scored slots of one dog's round, in the order its rotation group visits the posts (KOE-1665):
 * every post of its day in number order where the day has no rotation of its own. A day without posts
 * has an empty round.
 */
export const dogRound = (event: RotationEvent, dog: RotationDog): RoundTask[] =>
  dogVisits(event, dog).flatMap((visit) => stationSlots(visit.station.id, visit))

/**
 * The columns of a table of dogs whose rounds may differ: every slot any of them has, in the order of
 * the first round that has it. Rows in start order put the first group's rotation first.
 */
export const roundColumns = (rounds: readonly (readonly RoundTask[])[]): RoundTask[] => {
  const seen = new Set<string>()
  return rounds.flat().filter((task) => {
    const key = `${task.stationId}#${task.index}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Where a stored score sits: its post and its slot there, the address `stationSlots` gives it. */
const slotKey = (slot: Pick<RoundTask, 'stationId' | 'index'>): string => `${slot.stationId}#${slot.index}`

/**
 * Whether a slot reads a stored score the same way in two rounds: the same task of the post, split the
 * same way. A slot's index is task × parts + part, so a change of `parts` gives an index another task or
 * another maximum, and a score kept there would be read with a meaning it was not given.
 */
const sameSlot = (a: RoundTask | undefined, b: RoundTask | undefined): boolean =>
  a !== undefined && a.task === b?.task && a.parts === b?.parts

/**
 * Whether a stored task records anything. The results table stores a slot it shows as unscored
 * (`points: null`) as soon as the row is edited, so a task without points, a zero's reason, a recall or a
 * retirement is an empty field, and dropping it loses nothing the secretary would need to be asked about.
 */
export const isRecordedTask = (
  task: Pick<JsonEventResultTask, 'points' | 'recalled' | 'retired' | 'zeroFault'>
): boolean => task.points !== null || Boolean(task.zeroFault) || Boolean(task.recalled) || Boolean(task.retired)

const slotsByKey = (round: readonly RoundTask[]) => new Map(round.map((slot) => [slotKey(slot), slot]))

/**
 * Whether a dog's round scores differently after a change of the posts, the rotation or the classes
 * (KOE-1666): a slot added, removed, or meaning something else. A new order of the same slots is not a
 * difference, since the total and the prize do not depend on it.
 */
export const roundsDiffer = (before: readonly RoundTask[], after: readonly RoundTask[]): boolean => {
  if (before.length !== after.length) return true
  const next = slotsByKey(after)
  return before.some((slot) => !sameSlot(slot, next.get(slotKey(slot))))
}

/**
 * The stored scores a new round keeps, and the ones it drops (KOE-1666). A score is kept only where its
 * slot means the same in the dog's round before the change and after it; everything else is dropped,
 * a score the old round did not read either. The event save warns about the dropped ones before it
 * writes, and the recompute leaves them out, so no score is read against a task it was not given for.
 */
export const reconcileRoundTasks = <T extends Pick<JsonEventResultTask, 'stationId' | 'index'>>(
  before: readonly RoundTask[],
  after: readonly RoundTask[],
  tasks: readonly T[] | undefined
): { kept: T[]; dropped: T[] } => {
  const previous = slotsByKey(before)
  const next = slotsByKey(after)
  const kept: T[] = []
  const dropped: T[] = []
  for (const task of tasks ?? []) {
    const key = slotKey(task)
    if (sameSlot(previous.get(key), next.get(key))) kept.push(task)
    else dropped.push(task)
  }
  return { dropped, kept }
}

/** A dog that would lose recorded scores to a change of the posts, as the secretary is asked about it. */
export interface DroppedTasksDog {
  id: string
  name: string
  class?: string
  /** The start number, where the dog has one. */
  number?: number
  /** How many recorded scores it loses. */
  tasks: number
}

/**
 * The event save's answer when a change of the posts, the rotation or the classes would drop recorded
 * scores (KOE-1666). `confirmation` is opaque: a save that sends it back confirms this very set of drops,
 * and a set that has changed since is asked about again.
 */
export interface ResultTasksDroppedBody {
  error: 'resultTasksDropped'
  confirmation: string
  dogs: DroppedTasksDog[]
}

const isDroppedTasksDog = (value: unknown): value is DroppedTasksDog =>
  isObject(value) && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.tasks === 'number'

export const isResultTasksDroppedBody = (body: unknown): body is ResultTasksDroppedBody =>
  isObject(body) &&
  body.error === 'resultTasksDropped' &&
  typeof body.confirmation === 'string' &&
  Array.isArray(body.dogs) &&
  body.dogs.every(isDroppedTasksDog)

/**
 * A slot named by its post rather than its place in a round: "Rasti 2", "Rasti 2, tehtävä 2", with the
 * part after it where the task is split. The heading of a column the rows of a class number differently,
 * the class going round in rotation groups of their own order.
 */
export const formatPostTaskName = (
  task: RoundTask,
  station: { number: number } | undefined,
  t: TFunction<'translation'>
): string => {
  const number = station?.number ?? ''
  const name =
    task.task > 0 ? t('results.column.postTask', { number, task: task.task + 1 }) : t('results.column.post', { number })
  return task.parts > 1
    ? `${name}, ${t('results.column.part', { part: (task.index % task.parts) + 1, parts: task.parts })}`
    : name
}

/** A slot as the secretary reads it: "Tehtävä 2", or "Tehtävä 2, osa 1/2" for a part of a split task. */
export const formatTaskName = (task: RoundTask, t: TFunction<'translation'>): string =>
  task.parts > 1
    ? t('results.column.taskPart', { number: task.taskNumber, part: (task.index % task.parts) + 1, parts: task.parts })
    : t('results.column.task', { number: task.taskNumber })

/**
 * The dogs a post sees, in the order they come to it. Where the post scores tasks, that is the rotation's
 * queue (`stationQueue`), each dog with what its group does here, and a dog whose group does not come
 * here is left out. Where nothing is scored the post is the whole trial: every dog, in start order.
 */
export const stationDogsInOrder = <T extends SortableRegistration>(
  event: RotationEvent & { eventType: string },
  stationId: string,
  registrations: readonly T[]
): (T & { visit?: StationVisitLayout })[] => {
  if (!scoresAtPosts(event.eventType)) return [...registrations].sort(sortRegistrationsByDateClassTimeAndNumber)

  return stationQueue(event, stationId, registrations).map(({ registration, visit }) => ({ ...registration, visit }))
}

/**
 * Join a class's round to one dog's entries, driven by the round so an unscored task reads as `null`
 * rather than vanishing from the total.
 */
export const toScoredTasks = (
  round: readonly RoundTask[],
  // Provenance is irrelevant to a score, so this accepts a task on its way in as readily as one stored.
  scored: readonly Pick<JsonEventResultTask, 'stationId' | 'index' | 'points'>[] | undefined
): ScoredTask[] =>
  round.map((task) => ({
    maxPoints: task.maxPoints,
    points: scored?.find((entry) => entry.stationId === task.stationId && entry.index === task.index)?.points ?? null,
    stationId: task.stationId,
    task: task.task,
  }))

export const nowtTotals = (tasks: readonly ScoredTask[]) => {
  const points = tasks.reduce((sum, task) => sum + (task.points ?? 0), 0)
  const maxPoints = tasks.reduce((sum, task) => sum + task.maxPoints, 0)

  return { maxPoints, percentage: maxPoints ? (points * 100) / maxPoints : 0, points }
}

/**
 * Compare as a ratio rather than a rounded percentage. On a four-post round the thresholds land on whole
 * numbers, but real scores do not — 53 of 80 is 66.25 % — and a dog on 64.6 % displayed as "65 %" must
 * not collect a second prize it did not earn.
 */
const atLeastPercent = (points: number, maxPoints: number, percent: number) => points * 100 >= percent * maxPoints

/**
 * Every task must yield at least half its points for a first prize. A task worth 20 therefore has a
 * floor of 10. Where a task splits into two parts the floor applies to their sum, so 9 + 8 clears it
 * although neither part reaches 10. Two tasks at one post are floored each on its own (KOE-1665).
 *
 * Not printed in §5.4.1, which gives the thresholds and nothing else — Jukka asserted the rule, so it
 * is practice or lives in the ohjeet. Tracked as unverified in the rules conformance ledger.
 */
const everyTaskAtLeastHalf = (tasks: readonly ScoredTask[]): boolean => {
  const sums = new Map<string, { points: number; maxPoints: number }>()

  for (const task of tasks) {
    const key = `${task.stationId}#${task.task ?? 0}`
    const sum = sums.get(key) ?? { maxPoints: 0, points: 0 }
    sum.points += task.points ?? 0
    sum.maxPoints += task.maxPoints
    sums.set(key, sum)
  }

  return [...sums.values()].every((sum) => sum.points * 2 >= sum.maxPoints)
}

/**
 * The prize for a round scored at posts.
 *
 * Returns `undefined` while the round is still incomplete, so a half-entered scorecard shows no prize
 * rather than a misleading one.
 *
 * Ordering carries meaning. Elimination and withdrawal *void* the round — there is no performance left
 * to judge — so they settle the result before any scoring runs. Checking the zero rule first would let
 * an early zero override an exclusion, reporting a dog as having failed on merit when it was in fact
 * thrown out.
 */
export const deriveNowtResult = ({ tasks, elimination, retirement }: NowtResultInput): ResultCode | undefined => {
  // §5.4.1 puts a hylkäävä virhe in the same sentence as an insufficient score and gives both a nought,
  // so by the rules this is '0'. An earlier ruling in this project put eliminations on the dash and
  // stands until Jukka revisits it; the divergence is in the rules conformance ledger, and the field
  // that would reach this is switched off meanwhile (KOE-1299).
  if (elimination) return '-'
  // §5.4.1 grants the handler's own withdrawal the dash only where a prize was still in reach.
  if (retirement?.cause === 'handlerChoice') return retirement.couldStillHavePlaced ? '-' : '0'
  if (retirement?.cause === 'judgeStopped') return STOPPED_RESULT_CODE
  if (retirement) return '-'

  if (tasks.length === 0 || tasks.some((task) => task.points === null)) return undefined

  // A single zero bars every prize, whatever the total: "jos koira on saanut jostain tehtävästä nolla
  // pistettä, sitä ei voida palkita".
  if (tasks.some((task) => task.points === 0)) return '0'

  const { points, maxPoints } = nowtTotals(tasks)
  if (maxPoints === 0) return '0'

  // The per-task floor gates the first prize only; second and third go on the total alone.
  if (atLeastPercent(points, maxPoints, NOWT_PRIZE_THRESHOLD_PERCENT[1]) && everyTaskAtLeastHalf(tasks)) return '1'
  if (atLeastPercent(points, maxPoints, NOWT_PRIZE_THRESHOLD_PERCENT[2])) return '2'
  if (atLeastPercent(points, maxPoints, NOWT_PRIZE_THRESHOLD_PERCENT[3])) return '3'

  return '0'
}

/**
 * Event types judged pass or fail rather than placed. Both still use the shared alphabet — a pass is
 * `1` and a fail `0` — so `NOU1` and `NKM0`, never words.
 */
const PASS_FAIL_EVENT_TYPES = new Set(['NOU', 'NKM'])

/**
 * The codes a secretary may record for an event type.
 *
 * Neither pass/fail type offers the dash: their rules (NOU §2.4, NKM §6.4) describe only a pass and a
 * fail, and a dash on a test with nothing to place against would mean nothing. Published results bear
 * it out — NOU rows are NOU1 and NOU0, never NOU-.
 */
export const availableResultCodes = (eventType: string): ResultCode[] =>
  PASS_FAIL_EVENT_TYPES.has(eventType) ? ['1', '0'] : ['1', '2', '3', '0', '-']

/**
 * What a trial the judge stopped reads as: a nought.
 *
 * Every format's rules agree, so this needs no per-format answer — NOME-B §4.4 ("tuomari joutuu
 * keskeyttämään kokeen, merkitään palkintosijan kohdalle nolla (0)"), NKM §6.4 in the same words,
 * NOME-A §3.4 and NOWT §5.4.1 for the stops those name. The dash is reserved for a *handler* retiring
 * while a prize was still in reach, and in NOWT for a judge stopping over injury or illness; a judge's
 * stop on the dog's work is never the dash. A published NOME-B row reads `ALO0` with `Kesk.` beside it.
 *
 * Shared by the entry screen and the write boundary so the secretary sees the line that gets stored.
 */
export const STOPPED_RESULT_CODE = '0' satisfies ResultCode

/**
 * Whether a result can carry a judge's stop. The rules give the stop the nought and nothing else, so a
 * prize or a dash with `Kesk.` beside it would say two things at once — the shape the entry screen let
 * through until Minsu found it there (KOE-1300). Nothing entered yet can carry one: the stop fills the
 * nought in.
 */
export const canBeStopped = (resultCode?: ResultCode): boolean =>
  resultCode === undefined || resultCode === STOPPED_RESULT_CODE

/**
 * Results are written as a prefix and a code: `ALO1`, `AVO-`, and for event types without classes
 * `NOU1` or `NKM0`. This is the same class-or-event-type rule `getEventProgress` already applies when
 * it falls back to `[event.eventType]` for an event with no classes.
 */
export const eventResultPrefix = (eventType: string, eventClass?: string): string => eventClass ?? eventType

export const formatEventResult = (code: ResultCode, eventType: string, eventClass?: string): string =>
  `${eventResultPrefix(eventType, eventClass)}${code}`

/** The format as Kennelliitto names it (Koe/Kokeet, Koe/Koemuoto): a championship is its plain format. */
export const kcFormatOfEventType = (eventType: string): string => eventType.replace(/ SM$/, '')

/** Whether the event type's format records a judge's stop (`JUDGE_STOP_FORMATS`). A championship follows its format. */
export const hasJudgeStop = (eventType?: string): boolean =>
  JUDGE_STOP_FORMATS.has(kcFormatOfEventType(eventType ?? ''))

/**
 * The prefix Kennelliitto writes a result under: the class, or where the trial runs none, the last part
 * of the format's name. NOME-A and its championship write `A1`, NOU and NKM keep their own name. Takes
 * an event type or Koe/Koemuoto's `koemuoto`, which name a format the same way.
 *
 * A class equal to the event type is no class: the pages read a classless dog's class as its event type
 * (`getRegistrationClass`), and `eventResultPrefix` stores both the same.
 */
export const resultPrefixAsKennelClub = (eventType: string, eventClass?: string): string => {
  if (eventClass && eventClass !== eventType) return eventClass
  const format = kcFormatOfEventType(eventType)
  return format.slice(format.lastIndexOf('-') + 1)
}

/**
 * A result as a person reads it: Kennelliitto's spelling, the one KoiraNet lists (KOE-1592). Stored
 * results keep the prefix `formatEventResult` gives them; only what is shown changes.
 */
export const formatShownResult = (code: ResultCode, eventType: string, eventClass?: string): string =>
  `${resultPrefixAsKennelClub(eventType, eventClass)}${code}`

/**
 * Read the code back out of a stored result, so an entry screen can seed from what is recorded rather
 * than showing a scored dog as blank. Refuses a foreign prefix and a code the event type cannot award —
 * either means the stored string is not this view's to interpret.
 */
export const parseEventResultCode = (
  result: string | undefined,
  eventType: string,
  eventClass?: string
): ResultCode | undefined => {
  const prefix = eventResultPrefix(eventType, eventClass)
  if (!result?.startsWith(prefix)) return undefined

  const code = result.slice(prefix.length)
  return availableResultCodes(eventType).find((candidate) => candidate === code)
}

/**
 * A stored result as a person reads it (`formatShownResult`). A string this event cannot read back is
 * shown as it is stored, never hidden.
 */
export const shownEventResult = (
  result: string | undefined,
  eventType: string,
  eventClass?: string
): string | undefined => {
  const code = parseEventResultCode(result, eventType, eventClass)
  return code ? formatShownResult(code, eventType, eventClass) : result
}

/** A task as it arrives from a client: provenance is the server's to assign, not the client's to claim. */
export type SubmittedTask = Omit<JsonEventResultTask, 'updatedAt' | 'updatedBy'>

/** What the secretary submits for one dog. Totals are never taken from the client. */
export interface SubmittedEventResult {
  tasks?: JsonEventResultTask[]
  /**
   * The only source of a result for qualitative event types. For post-scored types this overrides the
   * derivation, though §5.4.1 grants no such discretion — no client sends one, and whether the
   * server-side override should stay belongs to the deferred conformance work.
   */
  resultCode?: ResultCode
  cert?: boolean
  resCert?: boolean
  elimination?: EventResultElimination
  retirement?: EventResultRetirement
  judge?: PublicJudge
  notes?: string
}

interface EventResultContext {
  eventType: string
  eventClass?: string
  /** The dog's round (`dogRound`). Read only for an event type scored at posts. */
  round?: readonly RoundTask[]
}

/**
 * Turn a submission into the result that gets stored, deriving everything derivable.
 *
 * Totals are recomputed here rather than trusted, so the same module decides the prize whether the
 * question is asked by the entry screen as scores are typed or by the server as they are saved. Those
 * two disagreeing is the failure this exists to prevent.
 */
export const resolveEventResult = (
  submitted: SubmittedEventResult,
  { eventType, eventClass, round = [] }: EventResultContext
): Omit<JsonEventResult, 'updatedAt' | 'updatedBy'> => {
  const { tasks, resultCode, ...rest } = submitted
  const voided = Boolean(submitted.elimination) || Boolean(submitted.retirement)

  if (!scoresAtPosts(eventType)) {
    // Nothing to derive: a qualitative type is whatever the judge decided — except a stopped trial,
    // which the rules publish as the nought whatever else came in with it (`canBeStopped`), so that is
    // filled in rather than left to the secretary to pick as well as recording the stop.
    const code = submitted.retirement?.cause === 'judgeStopped' ? STOPPED_RESULT_CODE : resultCode

    return {
      ...rest,
      ...(code ? { result: formatEventResult(code, eventType, eventClass) } : {}),
    }
  }

  const scored = toScoredTasks(round, tasks)
  const code = resultCode ?? deriveNowtResult({ ...submitted, tasks: scored })

  // A voided round has no total worth publishing: two thirds of a round is not a worse performance
  // than a whole one, and a percentage beside dogs who ran everything invites the wrong comparison.
  const totals = voided ? undefined : nowtTotals(scored)

  return {
    ...rest,
    ...(tasks ? { tasks } : {}),
    ...(totals ? { maxPoints: totals.maxPoints, percentage: totals.percentage, points: totals.points } : {}),
    ...(code ? { result: formatEventResult(code, eventType, eventClass) } : {}),
  }
}

/**
 * Whether two stored results say the same thing about the dog.
 *
 * `updatedAt` and `updatedBy` record who wrote it down and when, not what happened, so they are left
 * out: a retry that lands after the first attempt already succeeded must read as the same result, not
 * as a competing one.
 */
export const sameEventResult = (a?: JsonEventResult, b?: JsonEventResult): boolean => {
  if (!a || !b) return a === b

  // Strip provenance from the tasks as well as the result. A resubmission is stamped afresh before it
  // is compared, so leaving the task stamps in would make every retry look like a new result.
  const bare = ({ updatedAt: _at, updatedBy: _by, tasks, ...rest }: JsonEventResult) => ({
    ...rest,
    ...(tasks ? { tasks: tasks.map(({ updatedAt: _a, updatedBy: _b, ...task }) => task) } : {}),
  })

  return !objectsDiffer(bare(a), bare(b))
}

/**
 * The task shape these helpers need. Generic over `updatedAt` because the client holds a `Date`, made
 * at the typed boundary (`lib/wire.ts`), while the server holds the string it stored.
 */
interface StationScopedTask {
  stationId: string
  index: number
  updatedAt: string | Date
  updatedBy: string
}

/** The tasks belonging to one post. */
const stationTasks = <T extends StationScopedTask>(tasks: readonly T[] | undefined, stationId: string): T[] =>
  (tasks ?? []).filter((task) => task.stationId === stationId)

/**
 * The latest write among a post's tasks — the version a station-scoped edit is made against.
 *
 * Provenance is tracked per post rather than per result because posts are scored in parallel. A whole-
 * result version would go stale every time any other post saved, and every station's next save would
 * look like a conflict with work it never touched.
 */
export const stationVersion = <T extends StationScopedTask>(
  tasks: readonly T[] | undefined,
  stationId: string
): T['updatedAt'] | undefined => {
  const own = stationTasks(tasks, stationId)
  if (!own.length) return undefined

  // Compare by instant rather than sorting the raw values: sorting happens to work on ISO strings and
  // not at all on Date objects, which sort by their locale text.
  return own.reduce((latest, task) => (new Date(task.updatedAt) > new Date(latest.updatedAt) ? task : latest), own[0])
    .updatedAt
}

const withoutProvenance = <T extends StationScopedTask>({ updatedAt: _at, updatedBy: _by, ...rest }: T) => rest
const byIndex = (a: { index: number }, b: { index: number }) => a.index - b.index

/** Whether two rounds say the same thing about one post, ignoring who recorded it and when. */
export const sameStationTasks = <T extends StationScopedTask>(
  a: readonly T[] | undefined,
  b: readonly T[] | undefined,
  stationId: string
): boolean =>
  !objectsDiffer(
    stationTasks(a, stationId).map(withoutProvenance).sort(byIndex),
    stationTasks(b, stationId).map(withoutProvenance).sort(byIndex)
  )

/**
 * Replace one post's tasks and leave the rest of the round as stored.
 *
 * Posts are scored independently, so a station secretary submitting their own post must not carry away
 * the scores another post already recorded for the same dog.
 */
export const mergeStationTasks = <T extends StationScopedTask>(
  stored: readonly T[] | undefined,
  submitted: readonly T[] | undefined,
  stationId: string
): T[] => [...(stored ?? []).filter((task) => task.stationId !== stationId), ...stationTasks(submitted, stationId)]

/** What `placementsFor` reads of a registration: where the dog ran and what it scored. */
type PlacementRow = Pick<
  JsonRegistration | Registration,
  'id' | 'class' | 'eventType' | 'cancelled' | 'group' | 'startGroup'
> & {
  eventResult?: Pick<JsonEventResult, 'result' | 'points' | 'maxPoints'>
}

/**
 * The placement of every awarded dog, by registration id: derived, never stored, because it depends on
 * the other dogs of the class and day and would go stale on every path that moves a dog in or out.
 *
 * Only events scored at posts rank; a qualitative type has nothing to order by. A dog ranks when it ran
 * (a participant with a day), was awarded a prize (code 1, 2 or 3) and has points to be ordered by —
 * a prize 0, a dash, an unscored dog and an awarded dog without points (a voided round whose code was
 * overridden) get none and take no rank. Dogs are ranked within their class and day, by the share of
 * the round's maximum compared exactly (maxPoints can differ within a class: its rotation groups may do
 * different numbers of tasks, and the posts may have been edited).
 * Ties share a rank and the next rank skips: 1, 2, 2, 4.
 *
 * The day is the one the dog ran: the frozen placement's over the working order's, as the trial's
 * calendar day (`getRegistrationGroupDay`). The sending to Kennelliitto keys its day the same way
 * (`kcResultDay`), so a dog ranks among the dogs of the day its result is sent for.
 */
export const placementsFor = (rows: readonly PlacementRow[]): Map<string, number> => {
  const groups = new Map<string, { id: string; points: number; maxPoints: number }[]>()

  for (const row of rows) {
    const { eventResult } = row
    const day = getRegistrationGroupDay(getRegistrationPlacement(row)?.date)
    if (!scoresAtPosts(row.eventType) || !isScorableRegistration(row) || !day) continue
    const { points, maxPoints } = eventResult ?? {}
    if (typeof points !== 'number' || typeof maxPoints !== 'number' || maxPoints <= 0) continue

    const eventClass = getRegistrationClass(row)
    const code = parseEventResultCode(eventResult?.result, row.eventType, eventClass)
    if (code !== '1' && code !== '2' && code !== '3') continue

    const key = `${eventClass}|${day}`
    const entries = groups.get(key) ?? []
    entries.push({ id: row.id, maxPoints, points })
    groups.set(key, entries)
  }

  const placements = new Map<string, number>()

  for (const entries of groups.values()) {
    // a before b when a.points / a.maxPoints is larger, without dividing.
    entries.sort((a, b) => b.points * a.maxPoints - a.points * b.maxPoints)

    let rank = 0
    entries.forEach((entry, index) => {
      const previous = entries[index - 1]
      const tied = previous && previous.points * entry.maxPoints === entry.points * previous.maxPoints
      // A tie keeps the rank of the dog before it; otherwise the rank is the position, so 1, 2, 2, 4.
      if (!tied) rank = index + 1
      placements.set(entry.id, rank)
    })
  }

  return placements
}
