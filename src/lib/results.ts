import type { TFunction } from 'i18next'
import type {
  EliminatingFault,
  EventResultElimination,
  EventResultRetirement,
  JsonEventResult,
  JsonEventResultTask,
  JsonPublicRegistration,
  JsonRegistration,
  NowtZeroFault,
  PublicJudge,
  Registration,
  ResultMark,
  StationVisitLayout,
} from '../types'
import type { SortableRegistration } from './registration'
import type { ExerciseSlot, ScoredTask } from './resultTasks'
import type { RotationEvent } from './rotation'
import { objectsDiffer } from './diff'
import { scoresAtPosts } from './liveFormat'
import {
  getRegistrationClass,
  getRegistrationGroupDay,
  getRegistrationPlacement,
  isScorableRegistration,
  sortRegistrationsByDateClassTimeAndNumber,
} from './registration'
import { dogRound, toScoredTasks } from './resultTasks'
import { rotationDogOf, stationQueue } from './rotation'

/**
 * The result codes shared by every event type. `0` and `-` are different outcomes: `0` says the dog did
 * not earn a prize, also where its trial was stopped on its work or its handler quit with no prize in
 * reach; `-` says the round ended with no verdict on that, as the rules of each format name. Both differ
 * again from an absent result, which says nothing has been recorded yet.
 */
export type ResultCode = '1' | '2' | '3' | '0' | '-'

/**
 * The marks published beside a result (KOE-1300).
 *
 * The rules say what a stopped dog's result line reads: a nought for the judge's stop on the dog's work
 * (`STOPPED_RESULT_CODE`), a dash for an injury or an illness (NOWT §5.4.1). Either is also what a dog
 * gets that simply went unplaced, made a hylkäävä virhe (the nought) or was withdrawn by its handler, and
 * NOME-B §4.3.3 requires more than
 * that: "Keskeyttämisen syy ja se, kenen toimesta keskeyttäminen on tapahtunut, merkitään arvosteluun."
 * The mark tells the judge's stop apart from a plain nought or dash, beside the code, the way Koiranet
 * carries it in "Lisämerkinnät" rather than inside the result. (The reason itself is KOE-1299.)
 *
 * Derived rather than entered: the secretary records what happened, and the mark follows. Every stop the
 * judge makes carries it, an injured or ill dog's included: Kennelliitto publishes those dashes with
 * "Kesk." beside them, and a handler's own withdrawal with neither (KOE-1669).
 *
 * The rules about a stop's code (`canBeStopped`, `withResultCode`, the outcome control's lock, the
 * qualitative fill-in in `resolveEventResult`) test `judgeStopped` alone on purpose: injury and illness
 * are offered only where the code is derived from them (NOWT), never entered beside them.
 */
const JUDGE_STOP_CAUSES: ReadonlySet<EventResultRetirement['cause']> = new Set(['judgeStopped', 'injury', 'illness'])

export const resultMarks = (result?: { retirement?: EventResultRetirement }): ResultMark[] =>
  result?.retirement && JUDGE_STOP_CAUSES.has(result.retirement.cause) ? ['interrupted'] : []

/** The marks as one reader-facing string, for wherever the result itself is spelled out. */
export const formatResultMarks = (marks: readonly ResultMark[] | undefined, t: TFunction<'translation'>): string =>
  (marks ?? []).map((mark) => t(`results.marks.${mark}`)).join(' ')

/** What a published result says of the dog's points. */
type ResultTotals = Pick<JsonPublicRegistration, 'maxPoints' | 'percentage' | 'points'>

/**
 * The totals as they are shown: the points, the maximum and the percentage as a whole number, or
 * nothing where the result has none (a qualitative type). Display only, as §5.3.1 announces the result
 * "prosentin tarkkuudella"; what is stored and sent stays exact (`nowtTotals`), and the prize thresholds
 * compare the exact ratio (`atLeastPercent`). The result line and the exported sheet both read them here,
 * so the two round alike (KOE-1673).
 */
export const shownTotals = ({ points, maxPoints, percentage }: ResultTotals): Required<ResultTotals> | undefined =>
  points !== undefined && maxPoints && percentage !== undefined
    ? { maxPoints, percentage: Math.round(percentage), points }
    : undefined

/** The totals of a result as they are read out, "65/80 p 81 %", or nothing where there are none. */
const formatResultTotals = (totals: ResultTotals, t: TFunction<'translation'>): string => {
  const shown = shownTotals(totals)
  return shown ? t('results.totals', shown) : ''
}

/**
 * The result as it is read out beside a dog: the code, the points against the maximum with the
 * percentage, the marks it carries and the placement, each only where there is one. One line for the
 * screen and the copied text alike.
 */
export const formatResultLine = (
  {
    marks,
    placement,
    result,
    ...totals
  }: ResultTotals & { marks?: readonly ResultMark[]; placement?: number; result?: string },
  t: TFunction<'translation'>
): string =>
  [
    result,
    result ? formatResultTotals(totals, t) : '',
    formatResultMarks(marks, t),
    placement ? t('results.placement', { placement }) : '',
  ]
    .filter(Boolean)
    .join(' ')

/**
 * Prize thresholds as percentages of the round's maximum (NOWT rules §5.4.1).
 *
 * The rules print these as the absolute points 80 / 65 / 50, but that is the same percentage against a
 * round of five exercises. Events now commonly run four for a maximum of 80, where a dog on 65 points has
 * 81 % and has earned a *first* prize: comparing raw points would score it a second.
 */
const NOWT_PRIZE_THRESHOLD_PERCENT = { 1: 80, 2: 65, 3: 50 } as const

/**
 * The formats whose rules record a judge's stop: NOME-A §3.3.3, NOME-B §4.3.3, NOWT §5.3.5 and §1.8,
 * NKM §6.4. NOU §2.3.3 stops a dog's trial too, but its result is the plain NOU0 of §2.4 and
 * Kennelliitto records no stop for it, so a taipumuskoe carries no stop mark (KOE-1643). The entry
 * screen reads this set because it has no koemuoto at hand; the write to Kennelliitto still checks the
 * live answer (`formatAllowsStop`). A format not listed here offers no stop until someone adds it.
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
 * the write boundary: NOWT §5.3.4's list one to one and in its order (KOE-1678), then `unknown`, the
 * secretary's "ei tiedossa" (KOE-1664).
 */
export const nowtZeroFaults: readonly NowtZeroFault[] = [
  'failedRetrieve',
  'unauthorizedRun',
  'outOfControl',
  'physicalContact',
  'persistentNoise',
  'refusedWater',
  'huntingWithDummy',
  'swappedDummy',
  'eyeWipe',
  'unknown',
]

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

/** A slot as the secretary reads it: "Rasti 2", or "Rasti 2, osa 1/2" for a part of a split exercise. */
export const formatTaskName = (slot: ExerciseSlot, t: TFunction<'translation'>): string =>
  slot.parts > 1
    ? t('results.column.taskPart', { number: slot.exercise, part: slot.part + 1, parts: slot.parts })
    : t('results.column.task', { number: slot.exercise })

/**
 * The dogs a post sees, in the order they come to it. Where the post scores exercises, that is the
 * post's queue (`stationQueue`): each dog once for each exercise its group does here, with that
 * exercise, and a dog whose group does not come here left out. Where nothing is scored the post is the
 * whole trial: every dog, in start order.
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
 * The round's points, its maximum and the percentage of the one against the other. §5.3.1 announces the
 * result "prosentteina maksimipistemäärästä prosentin tarkkuudella", which is how it is shown
 * (`shownTotals`). The percentage stored and sent to Omakoira stays exact: rounding it once on the way
 * in would make every later reader round a rounded figure, and Omakoira takes the decimals (KOE-1678).
 */
export const nowtTotals = (tasks: readonly ScoredTask[]) => {
  const points = tasks.reduce((sum, task) => sum + (task.points ?? 0), 0)
  const maxPoints = tasks.reduce((sum, task) => sum + task.maxPoints, 0)

  return { maxPoints, percentage: maxPoints ? (points * 100) / maxPoints : 0, points }
}

/**
 * The thresholds of §5.4.1 read as written: at least this share of the maximum, compared exactly rather
 * than through a rounded percentage. Today the two agree, since points are whole and every exercise is
 * worth 20 (§5.3.1), so 80, 65 and 50 % of the maximum all fall on whole points. The exact form needs no
 * such reasoning to be right, and orders dogs as `placementsFor` does (KOE-1678).
 */
const atLeastPercent = (points: number, maxPoints: number, percent: number) => points * 100 >= percent * maxPoints

/**
 * The prize for a round scored at posts, by §5.4.1 of the rules in force from 15.4.2023. It is the only
 * source of a working test's result: the rules leave the judge no discretion over it (KOE-1678).
 *
 * Returns `undefined` while the round is still incomplete, so a half-entered scorecard shows no prize
 * rather than a misleading one.
 *
 * A round that ended early settles the result before any scoring runs, and before the round is complete:
 * there is nothing left to score.
 */
export const deriveNowtResult = ({ tasks, elimination, retirement }: NowtResultInput): ResultCode | undefined => {
  // §5.4.1: a hylkäävä virhe (§5.3.5), and a trial stopped for disciplining the dog at the venue, are
  // the nought (KOE-1678).
  if (elimination) return '0'
  // §5.4.1 grants the handler's own withdrawal the dash only where a prize was still in reach.
  if (retirement?.cause === 'handlerChoice') return retirement.couldStillHavePlaced ? '-' : '0'
  if (retirement?.cause === 'judgeStopped') return STOPPED_RESULT_CODE
  // The judge's stop for injury or illness, which §5.4.1 gives the dash.
  if (retirement) return '-'

  if (tasks.length === 0 || tasks.some((task) => task.points === null)) return undefined

  // §5.4.1: a nollatulokseen johtava virhe (§5.3.4), which zeroes its exercise, is the nought whatever
  // the total.
  if (tasks.some((task) => task.points === 0)) return '0'

  const { points, maxPoints } = nowtTotals(tasks)
  // Not a rule: no round has a maximum of 0, and against one every threshold would hold.
  if (maxPoints === 0) return '0'

  // §5.4.1 (edition 15.4.2023) places on the total alone: 80, 65 and 50 % of the maximum. The rules
  // replaced in 2016 also asked half of each task's points for a first prize; that floor went on 2.11.2026
  // (KOE-1677).
  if (atLeastPercent(points, maxPoints, NOWT_PRIZE_THRESHOLD_PERCENT[1])) return '1'
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
 * What a trial the judge stopped reads as: a nought, with the exceptions below.
 *
 * NOME-B §4.4 ("tuomari joutuu keskeyttämään kokeen, merkitään palkintosijan kohdalle nolla (0)") and
 * NKM §6.4 give the judge's stop the nought outright, NOWT §5.4.1 for the stops it names (injury or
 * illness take the dash). In NOME-A the stop is the nought for a hylkäävä virhe or a weak performance
 * and the dash when the laatuarvostelu is withheld (§3.3.3, §3.4), which this does not model yet
 * (KOE-1692). A published NOME-B row reads `ALO0` with `Kesk.` beside it.
 *
 * The line sent to Kennelliitto follows the rules, not the row Koemuoto/Lue/Tulokset flags `keskeytys`
 * (`NKM-`, `A-`, NOWT `ALO-`): a stop the rules give the nought goes as the nought. Omakoira takes it with
 * `keskeytetty: true` in every format (Testi2, 4.11.2026: NKM0, ALO0, AVO0, A0 and NOME-B VOI0, KOE-1647).
 *
 * Shared by the entry screen and the write boundary so the secretary sees the line that gets stored.
 */
export const STOPPED_RESULT_CODE = '0' satisfies ResultCode

/**
 * Whether a result can carry a judge's stop. The rules give the stop the nought and nothing else, so a
 * prize or a dash with `Kesk.` beside it would say two things at once, the shape the entry screen let
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
   * The only source of a result for qualitative event types. A type scored at posts takes none: its
   * result is derived (§5.4.1, KOE-1678), the write boundary refuses one (`pickSubmittedResult`), and
   * `resolveEventResult` does not read it.
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
  round?: readonly ExerciseSlot[]
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

  // The derivation is the only source of a scored type's result (§5.4.1, KOE-1678). A code that came
  // with it is not read rather than refused: the server refuses it at its own boundary
  // (`pickSubmittedResult`), and this function also answers the entry screen as scores are typed, where
  // there is nothing to refuse to.
  const scored = toScoredTasks(round, tasks)
  const code = deriveNowtResult({ ...submitted, tasks: scored })

  // A round that ended early keeps what it earned, against the whole round: Kennelliitto publishes those
  // points beside the nought or the dash (KOE-1669).
  const totals = nowtTotals(scored)

  return {
    ...rest,
    ...(tasks ? { tasks } : {}),
    maxPoints: totals.maxPoints,
    percentage: totals.percentage,
    points: totals.points,
    ...(code ? { result: formatEventResult(code, eventType, eventClass) } : {}),
  }
}

/**
 * The registration with its NOWT totals worked out from its stored tasks where the stored result has
 * none: a round that ended early saved before KOE-1669, when such a round kept no totals. The tasks are
 * read against the dog's round as `resolveEventResult` reads them; nothing else of the result changes.
 * A result with totals, or of a type not scored at posts, is returned as it is.
 */
export const withStoredTotals = <T extends SortableRegistration & { eventResult?: JsonEventResult }>(
  event: RotationEvent,
  registration: T
): T => {
  const stored = registration.eventResult
  if (!stored?.tasks || stored.percentage !== undefined || !scoresAtPosts(registration.eventType)) return registration

  const { maxPoints, percentage, points } = nowtTotals(
    toScoredTasks(dogRound(event, rotationDogOf(registration)), stored.tasks)
  )
  return { ...registration, eventResult: { ...stored, maxPoints, percentage, points } }
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
 * a prize 0, a dash and an unscored dog get none and take no rank. A round that ended early is kept out
 * by its code, the nought or the dash, not by missing points: it keeps what it earned (KOE-1669). An
 * awarded dog without points, a row whose totals were never stored, takes no rank either. Dogs are
 * ranked within their class and day, by the share of the round's maximum compared exactly (maxPoints can
 * differ within a class: its rotation groups may do different numbers of tasks, and the posts may have
 * been edited).
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
