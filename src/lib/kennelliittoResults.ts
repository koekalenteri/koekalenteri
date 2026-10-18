import type { JsonConfirmedEvent, JsonKcResult, JsonKcState, JsonRegistration, PublicJudge } from '../types'
import { dayOf, TIME_ZONE } from './day'
import { hasRetrieveTypeChoice, isMockTrialClass } from './event'
import { makeArray } from './judge'
import { getRegistrationGroupDay, getRegistrationPlacement } from './registration'
import { parseEventResultCode, resultMarks, scoresAtPosts } from './results'

/**
 * Turning a dog's recorded result into the body Kennelliitto's Koe/Tulos/Tallenna takes (KOE-1140).
 *
 * Pure on purpose: the pre-check the secretary sees and the sending run this same function, so the
 * dialog cannot promise a result the server then refuses to send.
 */

/** The states of a trial in Kennelliitto that this code acts on (Koe/Lue `tila`, Testi2 15.10.2026). */
const KC_STATE_OPEN = 754
/** Handed to the chief judge for approval. Koe/AsetaTila takes this code. */
export const KC_STATE_HANDED_OVER = 1253
const KC_STATE_COMPLETED = 304

/** Results can be written to Kennelliitto only while the trial is in this state. */
export const isKcStateWritable = (code: number): boolean => code === KC_STATE_OPEN

/**
 * Whether the trial's results are out of the secretary's hands: handed to the chief judge or
 * finished. Only a fresh reading of the state lifts it, so a judge who sends the trial back unlocks it.
 */
export const isResultsLocked = (event: { kcState?: Pick<JsonKcState, 'code'> }): boolean =>
  event.kcState?.code === KC_STATE_HANDED_OVER || event.kcState?.code === KC_STATE_COMPLETED

/** The format as Koe/Kokeet and Koe/Koemuoto name it: a championship is asked as its plain format. */
export const kcFormatOfEventType = (eventType: string): string => eventType.replace(/ SM$/, '')

/** Koe/Koemuoto `tulostyyppi` of the result itself and of an additional info. */
const RESULT_TYPE = 247
const INFO_TYPE = 250

export interface KcKoemuotoResult {
  hylätty: boolean
  keskeytys: boolean
  tulos: string
  tulostyyppi: number
}

/** What of Koe/Koemuoto the mapping reads. Structural, so the lambda passes its own answer as it is. */
export interface KcKoemuoto {
  koemuoto: string
  tarkenteet: string[]
  tulokset: KcKoemuotoResult[]
}

export type KcResultEvent = Pick<
  JsonConfirmedEvent,
  'classes' | 'eventType' | 'judges' | 'kcGuid' | 'mockTrial' | 'retrieveType'
>

export type KcResultRegistration = Pick<
  JsonRegistration,
  'class' | 'dog' | 'eventResult' | 'group' | 'id' | 'startGroup'
>

/** The body of Koe/Tulos/Tallenna. Built in one place, so equal results give equal bodies and equal hashes. */
export interface KcResultBody {
  koeGUID: string
  rekisterinumero: string
  nimi: string
  päivä: string
  tulos: string
  hylätty: boolean
  keskeytetty: boolean
  tuomarit: number[]
  palkintotuomarit: number[]
  pisteet?: number
  /** The rank among the awarded dogs of the class and day. Only the formats scored at posts have one. */
  sijoitus?: number
  lisätiedot?: string
  tarkenne?: string
}

export type KcProblemCode =
  | 'noKcGuid'
  | 'noResult'
  | 'noDay'
  | 'noName'
  | 'noPlacement'
  | 'dayNotReached'
  | 'dayChanged'
  | 'resultNotAllowed'
  | 'stopNotAllowed'
  | 'noJudge'
  | 'judgeWithoutNumber'
  | 'tooManyJudges'
  | 'additionalInfoNotAllowed'
  | 'retrieveTypeMissing'
  | 'retrieveTypeNotAllowed'

export interface KcProblem {
  code: KcProblemCode
  /** What the problem names: the result, the judge, the additional info. */
  detail?: string
}

type KcResultOutcome = { body: KcResultBody; ok: true } | { ok: false; problems: KcProblem[] }

/** Kennelliitto takes at most this many judges besides the chief. */
const MAX_PRIZE_JUDGES = 4

/** Letters only, lower case: `vara-SERT`, `vara sert` and `Vara Sert` are one name. */
const nameKey = (value: string): string => value.toLocaleLowerCase('fi').replace(/[^\p{Letter}\p{Number}]+/gu, '')

/** The part of the format's name that prefixes its results where the trial runs no classes: `NOME-A` is `A`. */
const classlessPrefix = (koemuoto: string): string => koemuoto.split('-').at(-1) ?? koemuoto

/**
 * Kennelliitto's spelling of the result. Koekalenteri stores the class or the event type in front of
 * the code (`NOME-A1`, `NOME-A SM1`) where Kennelliitto's own list says `A1`, so the string is rebuilt
 * from the code and has to be one of the format's results, never guessed.
 */
const resultCodeOf = (registration: KcResultRegistration, event: KcResultEvent) =>
  parseEventResultCode(registration.eventResult?.result, event.eventType, registration.class ?? undefined)

const klResultOf = (registration: KcResultRegistration, event: KcResultEvent, koemuoto: KcKoemuoto) => {
  const code = resultCodeOf(registration, event)
  if (!code) return undefined
  const prefix = registration.class ?? classlessPrefix(koemuoto.koemuoto)
  return koemuoto.tulokset.find((row) => row.tulostyyppi === RESULT_TYPE && row.tulos === `${prefix}${code}`)
}

const judgeId = (judge: PublicJudge): number | undefined => (judge.id ? judge.id : undefined)

/** Every judge who judged the dog, the one that judged most of it first. */
const judgesOf = (registration: KcResultRegistration, event: KcResultEvent): PublicJudge[] => {
  const result = registration.eventResult
  const classJudges = makeArray(event.classes.find((item) => item.class === registration.class)?.judge)
  const chiefFallback = classJudges[0] ?? event.judges[0]

  if (scoresAtPosts(event.eventType)) {
    const posts = (result?.tasks ?? []).flatMap((task) => (task.judge ? [task.judge] : []))
    return [chiefFallback, ...posts].filter((judge): judge is PublicJudge => Boolean(judge))
  }
  return [result?.judge ?? chiefFallback].filter((judge): judge is PublicJudge => Boolean(judge))
}

type JudgeOutcome = { palkintotuomarit: number[]; tuomarit: number[] } | { problems: KcProblem[] }

const judgeNumbers = (registration: KcResultRegistration, event: KcResultEvent): JudgeOutcome => {
  const judges = judgesOf(registration, event)

  const unnumbered = judges.filter((judge) => judgeId(judge) === undefined)
  if (unnumbered.length) {
    return { problems: unnumbered.map((judge) => ({ code: 'judgeWithoutNumber', detail: judge.name })) }
  }

  // With no judge at all there is no chief either.
  const [chief, ...others] = [...new Set(judges.flatMap((judge) => judgeId(judge) ?? []))]
  if (chief === undefined) return { problems: [{ code: 'noJudge' }] }
  if (others.length > MAX_PRIZE_JUDGES) return { problems: [{ code: 'tooManyJudges' }] }
  return { palkintotuomarit: others, tuomarit: [chief] }
}

const infoRow = (koemuoto: KcKoemuoto, key: string) =>
  koemuoto.tulokset.find((row) => row.tulostyyppi === INFO_TYPE && nameKey(row.tulos) === key)

/** The additional infos the dog earned, spelled as Kennelliitto's format lists them. */
const additionalInfo = (
  registration: KcResultRegistration,
  event: KcResultEvent,
  koemuoto: KcKoemuoto
): { infos: string[] } | { problems: KcProblem[] } => {
  const wanted: Array<[boolean, string, string]> = [
    [Boolean(registration.eventResult?.cert), 'sert', 'sert'],
    [Boolean(registration.eventResult?.resCert), 'varasert', 'vara sert'],
  ]
  const infos: string[] = []
  const problems: KcProblem[] = []
  for (const [earned, key, label] of wanted) {
    if (!earned) continue
    const row = infoRow(koemuoto, key)
    if (row) infos.push(row.tulos)
    else problems.push({ code: 'additionalInfoNotAllowed', detail: label })
  }
  // A Mock trial is the event's property, but Kennelliitto holds it as an additional info of the result.
  if (event.mockTrial && registration.class && isMockTrialClass(registration.class)) {
    const row = infoRow(koemuoto, 'mocktrial')
    if (row) infos.push(row.tulos)
  }
  return problems.length ? { problems } : { infos }
}

/** The trial type of a B-trial, as Kennelliitto's format lists it, or why there is none. */
const tarkenneOf = (event: KcResultEvent, koemuoto: KcKoemuoto): { tarkenne?: string } | { problems: KcProblem[] } => {
  if (!hasRetrieveTypeChoice(event.eventType)) return {}
  if (!event.retrieveType) return { problems: [{ code: 'retrieveTypeMissing' }] }

  const wanted = event.retrieveType === 'game' ? 'riistakoe' : 'damikoe'
  const tarkenne = koemuoto.tarkenteet.find((item) => nameKey(item) === wanted)
  return tarkenne ? { tarkenne } : { problems: [{ code: 'retrieveTypeNotAllowed', detail: wanted }] }
}

/** Whether the format has any result that is a stop, which is the only place a judge's stop can go. */
const formatAllowsStop = (koemuoto: KcKoemuoto): boolean => koemuoto.tulokset.some((row) => row.keskeytys)

/**
 * The day of the dog's own run, as Kennelliitto writes it: the frozen placement's over the working
 * order's, as the trial's calendar day. The one rule `placementsFor` ranks by as well, so the rank sent
 * with a result is the rank among the dogs of the day it is sent for.
 */
export const kcResultDay = (registration: Pick<KcResultRegistration, 'group' | 'startGroup'>): string | undefined =>
  getRegistrationGroupDay(getRegistrationPlacement(registration)?.date) || undefined

/**
 * The percentage NOWT sends in place of points: `points * 100 / maxPoints` as recorded, and 0 for a
 * round that was stopped, which has no total (the dash is sent with points 0, Juha). Nothing is
 * rounded, and nothing is checked against the result's limits, which Kennelliitto's own list gets
 * wrong for ALO0 and ALO-: it answers with its reasons when it refuses a number.
 */
const pointsOf = (registration: KcResultRegistration): number => registration.eventResult?.percentage ?? 0

/**
 * The placement Kennelliitto takes with a NOWT result: the rank `placementsFor` derived for the dog over
 * every dog of the trial, which is why it is an input here and not computed from the one registration.
 * The API says a placement is given only where the format's results have one, so the other formats send
 * none. An awarded dog (prize 1, 2 or 3) that has no rank has no points to be ranked by (a voided round
 * whose code was overridden), and is not sent until it has.
 */
const placementOf = (
  event: KcResultEvent,
  registration: KcResultRegistration,
  placement: number | undefined
): { sijoitus?: number } | { problems: KcProblem[] } => {
  if (!scoresAtPosts(event.eventType)) return {}
  const code = resultCodeOf(registration, event)
  const awarded = code === '1' || code === '2' || code === '3'
  if (!awarded) return {}
  return placement === undefined ? { problems: [{ code: 'noPlacement' }] } : { sijoitus: placement }
}

const problemsOf = (outcome: object & { problems?: KcProblem[] }): KcProblem[] => outcome.problems ?? []

/** What is missing from the dog or the trial before the result itself is looked at. */
const basicProblems = (
  event: KcResultEvent,
  registration: KcResultRegistration,
  day: string | undefined
): KcProblem[] => {
  const problems: KcProblem[] = []
  if (!event.kcGuid) problems.push({ code: 'noKcGuid' })
  if (!registration.eventResult?.result) problems.push({ code: 'noResult' })
  if (!registration.dog.name?.trim() || !registration.dog.regNo?.trim()) problems.push({ code: 'noName' })
  if (!day) problems.push({ code: 'noDay' })
  return problems
}

/** The result's own problems: Kennelliitto's format does not list it, or it cannot carry the judge's stop. */
const resultProblems = (
  registration: KcResultRegistration,
  koemuoto: KcKoemuoto,
  row: KcKoemuotoResult | undefined
): KcProblem[] => {
  if (!row) return [{ code: 'resultNotAllowed', detail: registration.eventResult?.result }]
  const interrupted = resultMarks(registration.eventResult).length > 0
  return interrupted && !formatAllowsStop(koemuoto) ? [{ code: 'stopNotAllowed', detail: row.tulos }] : []
}

/**
 * The Tallenna body for one dog, or what stands in the way. `koemuoto` is Kennelliitto's answer for
 * the format the trial itself reports (Koe/Lue), never one derived from the event type here, and
 * `placement` is the dog's rank among the trial's dogs (`placementsFor`), which one registration cannot tell.
 */
export const buildKcResult = (
  event: KcResultEvent,
  registration: KcResultRegistration,
  koemuoto: KcKoemuoto,
  placement?: number
): KcResultOutcome => {
  const day = kcResultDay(registration)
  const basic = basicProblems(event, registration, day)
  const row = basic.length ? undefined : klResultOf(registration, event, koemuoto)
  const judges = judgeNumbers(registration, event)
  const info = additionalInfo(registration, event, koemuoto)
  const type = tarkenneOf(event, koemuoto)
  const rank = placementOf(event, registration, placement)
  const problems = [
    ...basic,
    ...(basic.length ? [] : resultProblems(registration, koemuoto, row)),
    ...problemsOf(judges),
    ...problemsOf(info),
    ...problemsOf(type),
    ...problemsOf(rank),
  ]

  if (problems.length || 'problems' in judges || 'problems' in info || 'problems' in type || 'problems' in rank) {
    return { ok: false, problems }
  }
  const name = registration.dog.name?.trim()
  const regNo = registration.dog.regNo?.trim()
  if (!row || !day || !name || !regNo || !event.kcGuid) return { ok: false, problems }

  return {
    body: {
      hylätty: row.hylätty,
      keskeytetty: row.keskeytys || resultMarks(registration.eventResult).length > 0,
      koeGUID: event.kcGuid,
      nimi: name,
      palkintotuomarit: judges.palkintotuomarit,
      päivä: day,
      rekisterinumero: regNo,
      tulos: row.tulos,
      tuomarit: judges.tuomarit,
      ...(scoresAtPosts(event.eventType) ? { pisteet: pointsOf(registration) } : {}),
      ...(rank.sijoitus === undefined ? {} : { sijoitus: rank.sijoitus }),
      ...(info.infos.length ? { lisätiedot: info.infos.join(', ') } : {}),
      ...(type.tarkenne ? { tarkenne: type.tarkenne } : {}),
    },
    ok: true,
  }
}

/** A day as a person reads it, d.M.yyyy: the form a message that names a day carries. */
export const finnishDay = (day: string): string => {
  const [year, month, date] = day.split('-')
  return `${Number(date)}.${Number(month)}.${year}`
}

/** Results can be written on the trial day or later (Juha): the dog's day must have begun in Finland. */
export const isKcDayReached = (day: string, now: Date): boolean => day <= dayOf(now, TIME_ZONE)

/* What the secretary's page and the endpoint say to each other (KOE-1140). */

export type KcDogStatus =
  /** A body can be sent and none has been. */
  | 'ready'
  /** Sent before, and the result is different now. */
  | 'changed'
  /** Sent, and what would be sent now is what was sent. */
  | 'unchanged'
  /** There is a result that cannot be sent, `problems` say why. */
  | 'blocked'
  /** A dog that ran and has no result. */
  | 'notRecorded'
  /** A result was sent for the dog, and the dog has no result or did not run any more. */
  | 'sentGone'

export interface KcDogReport {
  /** What Kennelliitto answered when the last call was refused. */
  errors?: string[]
  id: string
  eventClass?: string
  name: string
  problems: KcProblem[]
  regNo: string
  status: KcDogStatus
  tulosId?: number
}

export type KcBlockerCode =
  | 'notOfficial'
  | 'noKcGuid'
  | 'kcGuidChoose'
  | 'kcGuidConflict'
  | 'kcUnavailable'
  | 'koemuotoMismatch'
  | 'stateNotWritable'
  | 'handedOver'

/** What stops the whole trial from being sent. */
export interface KcBlocker {
  code: KcBlockerCode
  detail?: string
  virheet?: string[]
}

export type KcSendOutcome = 'sent' | 'failed' | 'skipped' | 'unchanged'

export interface KcSendReport {
  /** Where a dog that was asked for and not sent stood, and why (a `skipped` outcome). */
  dogStatus?: KcDogStatus
  errors?: string[]
  id: string
  name: string
  outcome: KcSendOutcome
  problems?: KcProblem[]
  regNo: string
  /** The status Kennelliitto answered with, for a call it refused without giving reasons. */
  status?: number
  tulosId?: number
}

export interface KcPreviewResponse {
  blockers: KcBlocker[]
  dogs: KcDogReport[]
  state?: { code: number; name: string }
}

export interface KcSendResponse {
  blockers: KcBlocker[]
  /** What each dog's sending came to, in the form the registration stores it. */
  kcResults: Array<{ id: string; kcResult: JsonKcResult }>
  /** Dogs the request had no time left for: ask for them again. */
  notAttempted: string[]
  reports: KcSendReport[]
}

/** What the page shows of a dog's result beside the dog, from the registration alone. */
export type KcResultBadge = 'changed' | 'failed' | 'sent' | 'unsent'

/**
 * Where a dog's result stands with Kennelliitto, as far as the stored registration says. A result
 * edited after it was sent, and one sent without knowing what Kennelliitto holds, both want sending
 * again; the preview, which also sees the content, has the last word.
 */
export const kcResultBadge = (registration: {
  eventResult?: { result?: string; updatedAt: Date | string }
  kcResult?: { payloadHash?: string; resultVersion?: string; status: JsonKcResult['status'] }
}): KcResultBadge | undefined => {
  const { eventResult, kcResult } = registration
  if (kcResult?.status === 'failed') return 'failed'
  if (kcResult?.status === 'sent') {
    const current =
      !eventResult ||
      kcResult.resultVersion === undefined ||
      new Date(kcResult.resultVersion).getTime() === new Date(eventResult.updatedAt).getTime()
    return kcResult.payloadHash !== undefined && current ? 'sent' : 'changed'
  }
  return eventResult?.result ? 'unsent' : undefined
}
