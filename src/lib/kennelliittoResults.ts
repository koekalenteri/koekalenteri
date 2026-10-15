import type { JsonConfirmedEvent, JsonKcResult, JsonKcState, JsonRegistration, PublicJudge } from '../types'
import { zonedDateString } from '../i18n/dates'
import { hasRetrieveTypeChoice, isMockTrialClass } from './event'
import { makeArray } from './judge'
import { getRegistrationPlacement } from './registration'
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

/**
 * NOWT results carry a placement that the results model does not hold yet (KOE-1535), and Kennelliitto
 * may refuse a prized dog without it. Until it exists the NOWT formats are not sent: KOE-1535 adds
 * `placement` to the body below and flips this to true.
 */
export const PLACEMENT_AVAILABLE_FOR_POST_SCORED = false

/** Whether results of this event type may be sent at all. The one place that knows about the gate. */
export const canSendResultsOfEventType = (eventType: string): boolean =>
  !scoresAtPosts(eventType) || PLACEMENT_AVAILABLE_FOR_POST_SCORED

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
  lisätiedot?: string
  tarkenne?: string
}

export type KcProblemCode =
  | 'noKcGuid'
  | 'noResult'
  | 'noDay'
  | 'noName'
  | 'dayNotReached'
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
const klResultOf = (registration: KcResultRegistration, event: KcResultEvent, koemuoto: KcKoemuoto) => {
  const code = parseEventResultCode(registration.eventResult?.result, event.eventType, registration.class ?? undefined)
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
  if (!judges.length) return { problems: [{ code: 'noJudge' }] }

  const unnumbered = judges.filter((judge) => judgeId(judge) === undefined)
  if (unnumbered.length) {
    return { problems: unnumbered.map((judge) => ({ code: 'judgeWithoutNumber', detail: judge.name })) }
  }

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

/** The day of the dog's own run, as Kennelliitto writes it. */
export const kcResultDay = (registration: Pick<KcResultRegistration, 'group' | 'startGroup'>): string | undefined => {
  const date = getRegistrationPlacement(registration)?.date
  return date ? zonedDateString(new Date(date)) : undefined
}

/**
 * The percentage NOWT sends in place of points: `points * 100 / maxPoints` as recorded, and 0 for a
 * round that was stopped, which has no total (the dash is sent with points 0, Juha). Nothing is
 * rounded, and nothing is checked against the result's limits, which Kennelliitto's own list gets
 * wrong for ALO0 and ALO-: it answers with its reasons when it refuses a number.
 */
const pointsOf = (registration: KcResultRegistration): number => registration.eventResult?.percentage ?? 0

/**
 * The Tallenna body for one dog, or what stands in the way. `koemuoto` is Kennelliitto's answer for
 * the format the trial itself reports (Koe/Lue), never one derived from the event type here.
 */
export const buildKcResult = (
  event: KcResultEvent,
  registration: KcResultRegistration,
  koemuoto: KcKoemuoto
): KcResultOutcome => {
  const problems: KcProblem[] = []
  const name = registration.dog.name?.trim()
  const regNo = registration.dog.regNo?.trim()
  const day = kcResultDay(registration)

  if (!event.kcGuid) problems.push({ code: 'noKcGuid' })
  if (!registration.eventResult?.result) problems.push({ code: 'noResult' })
  if (!name || !regNo) problems.push({ code: 'noName' })
  if (!day) problems.push({ code: 'noDay' })

  const row = problems.length ? undefined : klResultOf(registration, event, koemuoto)
  if (!problems.length && !row) {
    problems.push({ code: 'resultNotAllowed', detail: registration.eventResult?.result })
  }

  const interrupted = resultMarks(registration.eventResult).length > 0
  if (row && interrupted && !formatAllowsStop(koemuoto)) {
    problems.push({ code: 'stopNotAllowed', detail: row.tulos })
  }

  const judges = judgeNumbers(registration, event)
  if ('problems' in judges) problems.push(...judges.problems)
  const info = additionalInfo(registration, event, koemuoto)
  if ('problems' in info) problems.push(...info.problems)
  const type = tarkenneOf(event, koemuoto)
  if ('problems' in type) problems.push(...type.problems)

  if ('problems' in judges || 'problems' in info || 'problems' in type) return { ok: false, problems }
  if (problems.length || !row || !day || !name || !regNo || !event.kcGuid) return { ok: false, problems }

  return {
    body: {
      hylätty: row.hylätty,
      keskeytetty: row.keskeytys || interrupted,
      koeGUID: event.kcGuid,
      nimi: name,
      palkintotuomarit: judges.palkintotuomarit,
      päivä: day,
      rekisterinumero: regNo,
      tulos: row.tulos,
      tuomarit: judges.tuomarit,
      ...(scoresAtPosts(event.eventType) ? { pisteet: pointsOf(registration) } : {}),
      ...(info.infos.length ? { lisätiedot: info.infos.join(', ') } : {}),
      ...(type.tarkenne ? { tarkenne: type.tarkenne } : {}),
    },
    ok: true,
  }
}

/** Results can be written on the trial day or later (Juha): the dog's day must have begun in Finland. */
export const isKcDayReached = (day: string, now: Date): boolean => day <= zonedDateString(now)

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
  | 'postScoredAwaitsPlacement'
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

export type KcSendOutcome = 'sent' | 'failed' | 'unchanged'

export interface KcSendReport {
  errors?: string[]
  id: string
  name: string
  outcome: KcSendOutcome
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
