import type {
  KcBlocker,
  KcDogReport,
  KcDogStatus,
  KcProblem,
  KcResultBody,
  KcSendReport,
} from '../../lib/kennelliittoResults'
import type { JsonConfirmedEvent, JsonDogEvent, JsonKcResult, JsonKcState, JsonRegistration, Patch } from '../../types'
import type { KLIntKoemuoto } from '../types/KLIntegraatio'
import type KLIntegraatio from './KLIntegraatio'
import { createHash } from 'node:crypto'
import {
  kcGuidFoundAudit,
  resultSendFailedAudit,
  resultSentToKennelliittoAudit,
  resultsHandedOverAudit,
} from '../../lib/audit'
import {
  buildKcResult,
  canSendResultsOfEventType,
  finnishDay,
  isKcDayReached,
  isKcStateWritable,
  KC_STATE_HANDED_OVER,
  kcFormatOfEventType,
  kcResultDay,
} from '../../lib/kennelliittoResults'
import { getRegistrationClass, isScorableRegistration } from '../../lib/registration'
import { mapWithConcurrency } from '../../lib/utils'
import { isKlAccepted } from '../types/KLIntegraatio'
import { audit, eventAuditKey, registrationAuditKey } from './audit'
import { findEventWithKcGuid, getEvent, lockKcState, releaseKcState, writeKcGuid, writeKcState } from './event'
import { getKLIntegraatio } from './KLIntegraatio'
import { searchKcTrials } from './kcTrial'
import { LambdaError } from './lambda'
import { logger } from './log'
import { getReadyRegistrationsByEventId, getRegistration, writeKcResult } from './registration'

/**
 * Sending a trial's results to Kennelliitto's Omakoira (KOE-1140): the checks that need no write, the
 * dog-by-dog sending, and the hand-over to the chief judge.
 *
 * Every body is built here from the stored registration with the one pure mapping the pre-check shows
 * the secretary (`buildKcResult`); nothing about a result is taken from the client.
 */

/** Dogs sent at one time. Kennelliitto is one service for the whole country; a few at once is polite. */
const SEND_CONCURRENCY = 4

/**
 * The request's whole budget. The gateway answers at 29 s, so every call to Kennelliitto is given up
 * when this is spent (a signal passed into the client), whatever call it is in the middle of: a token,
 * a call and the retry after a 401 cannot add up to more. What is written afterwards is DynamoDB.
 */
const REQUEST_BUDGET_MS = 25_000

/**
 * After this much of the budget no new dog is started. One that starts at the limit still has the
 * rest of the budget for its calls, and the dogs left are reported back for the client to ask again.
 */
const START_CUTOFF_MS = 17_000

/** The state name stored for a trial this code handed over itself. */
const HANDED_OVER_NAME = 'Ylituomarin hyväksyttäväksi'

interface KcContext {
  /** The request's budget in milliseconds, for a test that cannot wait for the real one. */
  budgetMs?: number
  /** The clock, in milliseconds. Injected, so the time of a request and the stamps it writes are testable. */
  clock?: () => number
  event: JsonConfirmedEvent
  /** Whether the event type is one of Kennelliitto's own. */
  official: boolean
  organizerKcId?: number
  userName: string
  klint?: KLIntegraatio
}

/** A request in progress: its context, and the signal that ends every call it makes when the budget is spent. */
interface KcRequest extends KcContext {
  signal: AbortSignal
}

const startRequest = (ctx: KcContext): KcRequest => ({
  ...ctx,
  signal: AbortSignal.timeout(ctx.budgetMs ?? REQUEST_BUDGET_MS),
})

const nowOf = (ctx: KcContext): Date => new Date((ctx.clock ?? Date.now)())

interface KcTrial {
  /** The trial as it stands, with the GUID and the state this request found. */
  event: JsonConfirmedEvent
  blockers: KcBlocker[]
  koemuoto?: KLIntKoemuoto
  /** What changed on the event itself, for the handler to publish. */
  eventPatch?: Patch<JsonDogEvent>
}

interface KcPreview {
  blockers: KcBlocker[]
  dogs: KcDogReport[]
  state?: { code: number; name: string }
  eventPatch?: Patch<JsonDogEvent>
}

interface KcSendResult {
  blockers: KcBlocker[]
  eventPatch?: Patch<JsonDogEvent>
  /** Dogs the time limit stopped from being tried. */
  notAttempted: string[]
  patches: Patch<JsonRegistration>[]
  reports: KcSendReport[]
}

/** Sha-256 of the body as it is sent. The one mapping builds the body, so equal results give equal bodies. */
const hashKcBody = (body: KcResultBody): string => createHash('sha256').update(JSON.stringify(body)).digest('hex')

const klintOf = (ctx: KcContext): KLIntegraatio => ctx.klint ?? getKLIntegraatio()

const toState = (code: number, name: string, readAt: Date): JsonKcState => ({
  code,
  name,
  readAt: readAt.toISOString(),
})

const upstreamBlocker = (status: number, virheet?: string[]): KcBlocker => ({
  code: 'kcUnavailable',
  detail: String(status),
  ...(virheet ? { virheet } : {}),
})

/**
 * An event linked before GUIDs has only the old id, which Kennelliitto no longer keeps. The trial is
 * found again the way the lookup finds it: one hit is taken, several are for the secretary to choose.
 */
const findKcGuid = async (
  req: KcRequest
): Promise<{ blocker?: KcBlocker; eventPatch?: Patch<JsonDogEvent>; kcGuid?: string }> => {
  const { event, organizerKcId } = req
  if (!organizerKcId) return { blocker: { code: 'noKcGuid' } }

  let choices: Awaited<ReturnType<typeof searchKcTrials>>
  try {
    choices = await searchKcTrials(klintOf(req), event, organizerKcId, { signal: req.signal })
  } catch (error) {
    logger.warn('Kennelliitto trial search failed', { error, eventId: event.id })
    return { blocker: { code: 'kcUnavailable' } }
  }

  const [choice] = choices
  if (choices.length > 1) return { blocker: { code: 'kcGuidChoose' } }
  if (!choice?.kcGuid) return { blocker: { code: 'noKcGuid' } }
  if (await findEventWithKcGuid(choice.kcGuid, event.id)) return { blocker: { code: 'kcGuidConflict' } }

  const updatedAt = nowOf(req).toISOString()
  if (await writeKcGuid(event.id, choice.kcGuid, updatedAt)) {
    await audit({ auditKey: eventAuditKey(event), ...kcGuidFoundAudit(), user: req.userName })
  }
  const stored = (await getEvent(event.id, true)).kcGuid
  return stored ? { eventPatch: { kcGuid: stored, updatedAt }, kcGuid: stored } : { blocker: { code: 'noKcGuid' } }
}

const stateBlocker = (code: number, name: string): KcBlocker | undefined => {
  if (isKcStateWritable(code)) return undefined
  return { code: code === KC_STATE_HANDED_OVER ? 'handedOver' : 'stateNotWritable', detail: name }
}

/** The trial found for the event, or what stands in the way of finding it. */
type Linked =
  | { event: JsonConfirmedEvent; eventPatch?: Patch<JsonDogEvent>; kcGuid: string }
  | { blocker: KcBlocker; event: JsonConfirmedEvent; eventPatch?: Patch<JsonDogEvent> }

const linkTrial = async (req: KcRequest, findGuid: boolean): Promise<Linked> => {
  const { event } = req
  if (event.kcGuid) return { event, kcGuid: event.kcGuid }
  if (!findGuid) return { blocker: { code: 'noKcGuid' }, event }

  const found = await findKcGuid(req)
  if (!found.kcGuid) return { blocker: found.blocker ?? { code: 'noKcGuid' }, event }
  return {
    event: { ...event, kcGuid: found.kcGuid },
    ...(found.eventPatch ? { eventPatch: found.eventPatch } : {}),
    kcGuid: found.kcGuid,
  }
}

/** Keeps the state Kennelliitto reported on the event, when it is another than the stored one. */
const storeState = async (event: JsonConfirmedEvent, state: JsonKcState, eventPatch?: Patch<JsonDogEvent>) => {
  if (event.kcState?.code === state.code && event.kcState?.name === state.name) return { event, eventPatch }
  const written = await writeKcState(event.id, state, state.readAt)
  return {
    event: { ...event, kcState: state },
    eventPatch: written ? { ...eventPatch, kcState: state, updatedAt: state.readAt } : eventPatch,
  }
}

type Read =
  | { blocker: KcBlocker; event: JsonConfirmedEvent; eventPatch?: Patch<JsonDogEvent> }
  | { event: JsonConfirmedEvent; eventPatch?: Patch<JsonDogEvent>; koemuoto: string }

/**
 * Kennelliitto's state of the trial. It is stamped when the answer has arrived, not when the request
 * began: of two readings the one that came last must win, or a slow newer one loses to a quick older one.
 */
const readState = async (
  req: KcRequest,
  linked: { event: JsonConfirmedEvent; eventPatch?: Patch<JsonDogEvent>; kcGuid: string }
): Promise<Read> => {
  const lue = await klintOf(req).lueKoe({ koeGuid: linked.kcGuid }, { signal: req.signal })
  const { event, eventPatch } = linked
  if (lue.status !== 200 || !lue.json) return { blocker: upstreamBlocker(lue.status, lue.virheet), event, eventPatch }
  if (lue.json.koemuoto !== kcFormatOfEventType(event.eventType)) {
    return { blocker: { code: 'koemuotoMismatch', detail: lue.json.koemuoto }, event, eventPatch }
  }

  const state = toState(lue.json.tila, lue.json.tilaNimi, nowOf(req))
  const stored = await storeState(event, state, eventPatch)
  const blocker = stateBlocker(state.code, state.name)
  return blocker ? { blocker, ...stored } : { ...stored, koemuoto: lue.json.koemuoto }
}

const stopped = (blocker: KcBlocker, event: JsonConfirmedEvent, eventPatch?: Patch<JsonDogEvent>): KcTrial => ({
  blockers: [blocker],
  event,
  ...(eventPatch ? { eventPatch } : {}),
})

/**
 * The checks that concern the trial and not a dog, in the order the first sending needs them: the
 * format may be sent at all, the trial is found, Kennelliitto's state lets results in, and the format's
 * results are known. The state is stored when it differs from what was stored, so a trial the judge
 * returned unlocks and one handed over elsewhere locks.
 */
const openKcTrial = async (req: KcRequest, { findGuid }: { findGuid: boolean }): Promise<KcTrial> => {
  if (!canSendResultsOfEventType(req.event.eventType)) return stopped({ code: 'postScoredAwaitsPlacement' }, req.event)
  if (!req.official) return stopped({ code: 'notOfficial' }, req.event)

  const linked = await linkTrial(req, findGuid)
  if ('blocker' in linked) return stopped(linked.blocker, linked.event, linked.eventPatch)
  const read = await readState(req, linked)
  if ('blocker' in read) return stopped(read.blocker, read.event, read.eventPatch)

  const koemuoto = await klintOf(req).lueKoemuoto({ koemuoto: read.koemuoto }, { signal: req.signal })
  if (koemuoto.status !== 200 || !koemuoto.json) {
    return stopped(upstreamBlocker(koemuoto.status, koemuoto.virheet), read.event, read.eventPatch)
  }
  return {
    blockers: [],
    event: read.event,
    ...(read.eventPatch ? { eventPatch: read.eventPatch } : {}),
    koemuoto: koemuoto.json,
  }
}

const dogReport = (registration: JsonRegistration, status: KcDogStatus, problems: KcProblem[] = []): KcDogReport => ({
  ...(registration.kcResult?.errors ? { errors: registration.kcResult.errors } : {}),
  ...(getRegistrationClass(registration) ? { eventClass: getRegistrationClass(registration) } : {}),
  id: registration.id,
  name: registration.dog.name ?? '',
  problems,
  regNo: registration.dog.regNo,
  status,
  ...(registration.kcResult?.tulosId ? { tulosId: registration.kcResult.tulosId } : {}),
})

interface Evaluated {
  body?: KcResultBody
  hash?: string
  registration: JsonRegistration
  report: KcDogReport
}

/**
 * What the dog's day says against sending: the day has not begun, or the result was sent for another day.
 * The day is part of what Kennelliitto keys a result by, so a dog moved after sending would leave a second
 * result behind; the old one has to go first (KOE-1220). Days are named d.M.yyyy: a yyyy-MM-dd string in a
 * response is revived into a Date by the client.
 */
const dayProblems = (registration: JsonRegistration, now: Date): KcProblem[] => {
  const day = kcResultDay(registration)
  const sentDay = registration.kcResult?.day
  const problems: KcProblem[] = []
  if (day && !isKcDayReached(day, now)) problems.push({ code: 'dayNotReached', detail: finnishDay(day) })
  if (day && sentDay && sentDay !== day) problems.push({ code: 'dayChanged', detail: finnishDay(sentDay) })
  return problems
}

/** Where a dog stands, from the stored registration and the format's results. Makes no call. */
const evaluateKcDog = (
  event: JsonConfirmedEvent,
  registration: JsonRegistration,
  koemuoto: NonNullable<KcTrial['koemuoto']>,
  now: Date
): Evaluated | undefined => {
  const scorable = isScorableRegistration(registration)
  const sent = registration.kcResult?.status === 'sent'
  if (!scorable || !registration.eventResult?.result) {
    if (sent) return { registration, report: dogReport(registration, 'sentGone') }
    return scorable ? { registration, report: dogReport(registration, 'notRecorded') } : undefined
  }

  const outcome = buildKcResult(event, registration, koemuoto)
  const problems = [...(outcome.ok ? [] : outcome.problems), ...dayProblems(registration, now)]
  if (!outcome.ok || problems.length) return { registration, report: dogReport(registration, 'blocked', problems) }

  const hash = hashKcBody(outcome.body)
  const previous = registration.kcResult
  let status: KcDogStatus = 'ready'
  if (previous?.status === 'sent' && previous.payloadHash === hash) status = 'unchanged'
  else if (previous?.payloadHash) status = 'changed'
  return { body: outcome.body, hash, registration, report: dogReport(registration, status) }
}

const evaluateAll = (
  event: JsonConfirmedEvent,
  registrations: JsonRegistration[],
  koemuoto: NonNullable<KcTrial['koemuoto']>,
  now: Date
): Evaluated[] => registrations.flatMap((registration) => evaluateKcDog(event, registration, koemuoto, now) ?? [])

const selected = (registrations: JsonRegistration[], ids?: string[]) =>
  ids ? registrations.filter((registration) => ids.includes(registration.id)) : registrations

/** What sending would do, without sending: the secretary's list before the confirmation. */
export const previewKennelliittoResults = async (ctx: KcContext, ids?: string[]): Promise<KcPreview> => {
  const req = startRequest(ctx)
  const trial = await openKcTrial(req, { findGuid: true })
  const state = trial.event.kcState && { code: trial.event.kcState.code, name: trial.event.kcState.name }
  const withState = { ...(state ? { state } : {}), ...(trial.eventPatch ? { eventPatch: trial.eventPatch } : {}) }
  if (!trial.koemuoto) return { blockers: trial.blockers, dogs: [], ...withState }

  const registrations = await getReadyRegistrationsByEventId(ctx.event.id, true)
  const evaluated = evaluateAll(trial.event, selected(registrations, ids), trial.koemuoto, nowOf(ctx))
  return { blockers: [], dogs: evaluated.map(({ report }) => report), ...withState }
}

/** The id Kennelliitto gave the saved result. The type says `TulosId`; the camelCase of v1.01 is accepted too. */
const tulosIdOf = (json: unknown): number | undefined => {
  if (typeof json !== 'object' || json === null) return undefined
  let id: unknown
  if ('TulosId' in json) id = json.TulosId
  else if ('tulosId' in json) id = json.tulosId
  return typeof id === 'number' ? id : undefined
}

/**
 * A refusal with reasons: Kennelliitto looked at the body and said no. A 5xx with reasons is not that: a
 * failing service may say anything, and the call may have been taken. Anything else leaves the outcome unknown.
 */
const isRefusal = (status: number, virheet?: string[]) => status >= 400 && status < 500 && Boolean(virheet?.length)

interface Sent {
  /** The day the body was sent for. */
  day: string
  hash: string
  version: string
}

const nextKcResult = (
  call: { json?: unknown; status: number; virheet?: string[] },
  sent: Sent,
  previous: JsonKcResult | undefined,
  by: string,
  at: string
): JsonKcResult => {
  // What Kennelliitto holds from before stays known through a refusal and through no answer at all.
  const kept = {
    ...(previous?.day === undefined ? {} : { day: previous.day }),
    ...(previous?.tulosId === undefined ? {} : { tulosId: previous.tulosId }),
  }
  if (isKlAccepted(call.status)) {
    const tulosId = tulosIdOf(call.json) ?? previous?.tulosId
    return {
      at,
      by,
      day: sent.day,
      payloadHash: sent.hash,
      resultVersion: sent.version,
      status: 'sent',
      ...(tulosId === undefined ? {} : { tulosId }),
    }
  }
  if (isRefusal(call.status, call.virheet)) {
    return {
      at,
      by,
      errors: call.virheet,
      ...(previous?.payloadHash ? { payloadHash: previous.payloadHash } : {}),
      ...(previous?.resultVersion ? { resultVersion: previous.resultVersion } : {}),
      status: 'failed',
      ...kept,
    }
  }
  // No answer, or one without reasons: the call may or may not have been taken, so no hash is kept and
  // the next sending calls Kennelliitto again. Saving the same body twice is an update, not a copy.
  return { at, by, status: 'failed', ...kept }
}

/** Writes what a sending came to; when another sending got in first, what Kennelliitto holds is unknown. */
const recordKcResult = async (
  req: KcRequest,
  registration: JsonRegistration,
  next: JsonKcResult
): Promise<JsonKcResult> => {
  const { event } = req
  const updatedAt = next.at
  if (await writeKcResult(event.id, registration.id, next, registration.kcResult?.at, updatedAt)) return next

  const { payloadHash: _unknown, resultVersion: _version, ...unknown } = next
  const latest = (await getRegistration(event.id, registration.id, true)).kcResult?.at
  if (!(await writeKcResult(event.id, registration.id, unknown, latest, updatedAt))) {
    logger.warn('kcResult could not be recorded', { eventId: event.id, registrationId: registration.id })
  }
  return unknown
}

const sendOne = async (
  req: KcRequest,
  { body, hash, registration }: Required<Pick<Evaluated, 'body' | 'hash'>> & Pick<Evaluated, 'registration'>,
  patches: Patch<JsonRegistration>[]
): Promise<KcSendReport> => {
  const { event, userName } = req
  // The version is read before the call: a result saved while Kennelliitto thinks about it is a later
  // version than the one the hash stands for, and reads as changed afterwards.
  const version = registration.eventResult?.updatedAt ?? ''
  const call = await klintOf(req).tallennaTulos(body, { signal: req.signal })
  const next = nextKcResult(
    call,
    { day: body.päivä, hash, version },
    registration.kcResult,
    userName,
    nowOf(req).toISOString()
  )

  const recorded = await recordKcResult(req, registration, next)
  patches.push({ id: registration.id, kcResult: recorded })

  const auditKey = registrationAuditKey({ eventId: event.id, id: registration.id })
  if (next.status === 'sent') {
    await audit({ auditKey, ...resultSentToKennelliittoAudit(), user: userName })
  } else {
    await audit({ auditKey, ...resultSendFailedAudit(next.errors?.join('; ') ?? `${call.status}`), user: userName })
  }

  return {
    id: registration.id,
    name: registration.dog.name ?? '',
    outcome: next.status === 'sent' ? 'sent' : 'failed',
    regNo: registration.dog.regNo,
    ...(next.errors ? { errors: next.errors } : {}),
    ...(next.status === 'sent' ? {} : { status: call.status }),
    ...(next.tulosId === undefined ? {} : { tulosId: next.tulosId }),
  }
}

/**
 * A result whose hash is what was sent needs no new call, but the version it stands for moves on: an
 * edit that was taken back has a later `updatedAt` and the same content.
 */
const keepVersion = async (req: KcRequest, { registration }: Evaluated, patches: Patch<JsonRegistration>[]) => {
  const { kcResult } = registration
  const version = registration.eventResult?.updatedAt
  if (!kcResult || !version || kcResult.resultVersion === version) return
  const next: JsonKcResult = { ...kcResult, resultVersion: version }
  if (await writeKcResult(req.event.id, registration.id, next, kcResult.at, nowOf(req).toISOString())) {
    patches.push({ id: registration.id, kcResult: next })
  }
}

const unchangedReport = ({ registration }: Evaluated): KcSendReport => ({
  id: registration.id,
  name: registration.dog.name ?? '',
  outcome: 'unchanged',
  regNo: registration.dog.regNo,
  ...(registration.kcResult?.tulosId === undefined ? {} : { tulosId: registration.kcResult.tulosId }),
})

const isSendable = (status: KcDogStatus) => status === 'ready' || status === 'changed'

/**
 * A dog that was asked for and got no line of the sending: it was not sendable, or it is not on the
 * trial any more. Said so, with where it stood, so a sending never answers less than it was asked.
 */
const skippedReport = (id: string, item: Evaluated | undefined): KcSendReport => ({
  dogStatus: item?.report.status ?? 'notRecorded',
  id,
  name: item?.registration.dog.name ?? '',
  outcome: 'skipped',
  problems: item?.report.problems ?? [],
  regNo: item?.registration.dog.regNo ?? '',
})

const skippedReports = (
  ids: string[],
  evaluated: Evaluated[],
  reports: KcSendReport[],
  notAttempted: string[]
): KcSendReport[] =>
  ids
    .filter((id) => !reports.some((report) => report.id === id) && !notAttempted.includes(id))
    .map((id) =>
      skippedReport(
        id,
        evaluated.find((item) => item.registration.id === id)
      )
    )

/** One dog of a sending: nothing for one that cannot be sent, no call for one that is as sent. */
const sendDog = async (
  req: KcRequest,
  item: Evaluated,
  {
    force,
    notAttempted,
    patches,
    startedAt,
  }: { force: boolean; notAttempted: string[]; patches: Patch<JsonRegistration>[]; startedAt: number }
): Promise<KcSendReport | undefined> => {
  const { body, hash, report } = item
  if (report.status === 'unchanged' && !force) {
    await keepVersion(req, item, patches)
    return unchangedReport(item)
  }
  if (!body || !hash || !(isSendable(report.status) || report.status === 'unchanged')) return undefined
  if (nowOf(req).getTime() - startedAt > START_CUTOFF_MS) {
    notAttempted.push(report.id)
    return undefined
  }
  return sendOne(req, { body, hash, registration: item.registration }, patches)
}

/**
 * Sends the results of the chosen dogs, one call each. A dog whose result is what was sent is left
 * alone unless `force` asks for it again (an edit made in Omakoira itself is invisible to the hash).
 * One dog's refusal never stops the others, and a request that has used its time leaves the rest for
 * the next one.
 */
export const sendKennelliittoResults = async (
  ctx: KcContext,
  ids: string[],
  { force }: { force: boolean }
): Promise<KcSendResult> => {
  const req = startRequest(ctx)
  const startedAt = nowOf(req).getTime()
  const trial = await openKcTrial(req, { findGuid: true })
  const patches: Patch<JsonRegistration>[] = []
  const eventPatch = trial.eventPatch && { eventPatch: trial.eventPatch }
  if (!trial.koemuoto) return { blockers: trial.blockers, notAttempted: [], patches, reports: [], ...eventPatch }

  const registrations = await getReadyRegistrationsByEventId(ctx.event.id, true)
  const evaluated = evaluateAll(trial.event, selected(registrations, ids), trial.koemuoto, new Date(startedAt))
  const notAttempted: string[] = []
  const sendReq = { ...req, event: trial.event }

  const sent = await mapWithConcurrency(evaluated, SEND_CONCURRENCY, (item) =>
    sendDog(sendReq, item, { force, notAttempted, patches, startedAt })
  )
  const reports = sent.filter((report): report is KcSendReport => report !== undefined)

  return {
    blockers: [],
    notAttempted,
    patches,
    reports: [...reports, ...skippedReports(ids, evaluated, reports, notAttempted)],
    ...eventPatch,
  }
}

interface KcHandOverResult {
  blockers: KcBlocker[]
  eventPatch?: Patch<JsonDogEvent>
  /** Hands over only once these are sent. */
  unsent?: KcDogReport[]
  /** Dogs that will not be in the hand-over, for the secretary to accept by name. */
  needsConfirmation?: KcDogReport[]
  /** No result has been sent at all: a hand-over of nothing needs the secretary's word. */
  nothingSent?: boolean
  handedOver: boolean
  /** Kennelliitto's refusal of the state change, or its silence (no reasons). */
  refused?: { status: number; virheet?: string[] }
}

const isLeftOut = ({ report }: Evaluated) =>
  report.status === 'blocked' || report.status === 'notRecorded' || report.status === 'sentGone'

const reportsOf = (items: Evaluated[]) => items.map(({ report }) => report)

/** What stands in the way of a hand-over, from the dogs as they are stored now. */
const handOverGate = (
  evaluated: Evaluated[],
  withoutBlocked: boolean
): Pick<KcHandOverResult, 'needsConfirmation' | 'nothingSent' | 'unsent'> | undefined => {
  const unsent = evaluated.filter(({ report }) => isSendable(report.status))
  if (unsent.length) return { unsent: reportsOf(unsent) }
  if (withoutBlocked) return undefined

  const leftOut = evaluated.filter(isLeftOut)
  if (leftOut.length) return { needsConfirmation: reportsOf(leftOut) }
  return evaluated.some(({ report }) => report.status === 'unchanged') ? undefined : { nothingSent: true }
}

const refusedBy = (call: { status: number; virheet?: string[] }): Pick<KcHandOverResult, 'refused'> => ({
  refused: { status: call.status, ...(call.virheet ? { virheet: call.virheet } : {}) },
})

/**
 * The lock a hand-over takes before it looks at the dogs a second time, and how to give it back.
 *
 * The lock is a state written ahead of Kennelliitto's own, and a result save is refused once it is there.
 * That holds outside a window of a few milliseconds: the lock check and the write of a result are two
 * tables, so a save that passed the check just before the lock may still land just after it, and the
 * second look at the dogs only sees saves that landed before.
 *
 * The lock is exclusive: it is taken only where no handed-over state is stored, and the second hand-over of
 * the trial is answered 409. Giving it back is conditional on the stored state still being this request's
 * lock, so a lock is only ever given back by the request that took it, and one that lost cannot undo the
 * one that won. A reading of Kennelliitto's state that arrives while the hand-over's call is out says what
 * Kennelliitto still held before the call (754), and does not replace a lock younger than the time a request
 * lives (`writeKcState`); a trial the judge returned later is read as open again.
 */
const takeLock = async (req: KcRequest, event: JsonConfirmedEvent) => {
  const handed = toState(KC_STATE_HANDED_OVER, HANDED_OVER_NAME, nowOf(req))
  if (!(await lockKcState(event.id, handed, KC_STATE_HANDED_OVER))) {
    throw new LambdaError(409, 'The trial is being handed over already, or its state changed meanwhile')
  }
  const previous = event.kcState
  const release = async () => {
    if (!previous) return
    const at = nowOf(req).toISOString()
    await releaseKcState(event.id, { ...previous, readAt: at }, handed.readAt, at)
  }
  return { handed, release }
}

/**
 * The state is written once more after Kennelliitto took the hand-over, with a reading stamped now: a
 * state read that landed during the call (and said 754) must not be the last word.
 *
 * Readings are ordered by the arrival of their answers, and the latest arrival wins, except that a
 * handed-over state is held for the time a request lives against a reading of another state: a request that
 * read the trial as open just before the hand-over cannot put 754 back over it. A judge who returns the trial
 * within that time is seen at the next read after it.
 */
const confirmHandOver = async (req: KcRequest, event: JsonConfirmedEvent): Promise<KcHandOverResult> => {
  const confirmed = toState(KC_STATE_HANDED_OVER, HANDED_OVER_NAME, nowOf(req))
  await writeKcState(event.id, confirmed, confirmed.readAt)
  await audit({ auditKey: eventAuditKey(event), ...resultsHandedOverAudit(), user: req.userName })
  return { blockers: [], eventPatch: { kcState: confirmed, updatedAt: confirmed.readAt }, handedOver: true }
}

/**
 * A state change that was not accepted: no answer, a 5xx, or a 4xx, with reasons or without. It may have
 * been taken, or another hand-over of the trial may have taken it first. The lock stays unless
 * Kennelliitto can be read and says the trial is not with the judge; a trial it cannot be asked about
 * stays locked until a preview reads it. A refusal's reasons are passed on.
 */
const settleUncertain = async (
  req: KcRequest,
  event: JsonConfirmedEvent,
  kcGuid: string,
  lock: Awaited<ReturnType<typeof takeLock>>,
  call: { status: number; virheet?: string[] }
): Promise<KcHandOverResult> => {
  const read = await klintOf(req).lueKoe({ koeGuid: kcGuid }, { signal: req.signal })
  if (read.status === 200 && read.json?.tila === KC_STATE_HANDED_OVER) return confirmHandOver(req, event)
  if (read.status === 200 && read.json) await lock.release()
  return { blockers: [], handedOver: false, ...refusedBy(call) }
}

/**
 * Hands the trial to the chief judge: the last step, after which the secretary can no longer correct.
 *
 * The lock is taken before the dogs are looked at the second time and given back if they turn out not
 * to be ready, so a result saved between the first look and the lock is seen by the second one and a
 * result saved after the lock is refused. A trial Kennelliitto already reports as handed over is not
 * handed over again; the state is stored and that is all.
 */
export const handOverKennelliittoResults = async (
  ctx: KcContext,
  { withoutBlocked }: { withoutBlocked: boolean }
): Promise<KcHandOverResult> => {
  const req = startRequest(ctx)
  const trial = await openKcTrial(req, { findGuid: false })
  const [blocker] = trial.blockers
  const eventPatch = trial.eventPatch && { eventPatch: trial.eventPatch }
  if (blocker?.code === 'handedOver') return { blockers: [], handedOver: true, ...eventPatch }
  const { koemuoto, event } = trial
  const kcGuid = event.kcGuid
  if (!koemuoto || !kcGuid) return { blockers: trial.blockers, handedOver: false, ...eventPatch }

  const evaluate = async () =>
    evaluateAll(event, await getReadyRegistrationsByEventId(event.id, true), koemuoto, nowOf(req))
  const first = handOverGate(await evaluate(), withoutBlocked)
  if (first) return { blockers: [], handedOver: false, ...first, ...eventPatch }

  const lock = await takeLock(req, event)
  const second = handOverGate(await evaluate(), withoutBlocked)
  if (second) {
    await lock.release()
    return { blockers: [], handedOver: false, ...second, ...eventPatch }
  }

  const call = await klintOf(req).asetaTila({ koeGUID: kcGuid, tila: KC_STATE_HANDED_OVER }, { signal: req.signal })
  if (isKlAccepted(call.status)) return confirmHandOver(req, event)
  // A refusal with reasons may also be Kennelliitto saying the trial is in that state already, because
  // another hand-over of the same trial got there first: Koe/Lue says which before the lock goes back.
  return settleUncertain(req, event, kcGuid, lock, call)
}
