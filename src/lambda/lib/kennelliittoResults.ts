import type {
  KcBlocker,
  KcDogReport,
  KcDogStatus,
  KcProblem,
  KcResultBody,
  KcSendReport,
} from '../../lib/kennelliittoResults'
import type { JsonConfirmedEvent, JsonDogEvent, JsonKcResult, JsonKcState, JsonRegistration, Patch } from '../../types'
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
  isKcDayReached,
  isKcStateWritable,
  KC_STATE_HANDED_OVER,
  kcFormatOfEventType,
  kcResultDay,
} from '../../lib/kennelliittoResults'
import { getRegistrationClass, isScorableRegistration } from '../../lib/registration'
import { mapWithConcurrency } from '../../lib/utils'
import { audit, eventAuditKey, registrationAuditKey } from './audit'
import { findEventWithKcGuid, getEvent, writeKcGuid, writeKcState } from './event'
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
 * The time a request spends on new calls before it stops starting them. The gateway answers at 29 s;
 * the dogs not yet started are reported back and the client asks for them again, so a slow Kennelliitto
 * costs a second request and not an answer that never comes.
 */
const SEND_DEADLINE_MS = 20_000

/** The state name stored for a trial this code handed over itself. */
const HANDED_OVER_NAME = 'Ylituomarin hyväksyttäväksi'

interface KcContext {
  /** The clock, in milliseconds. Injected, so the time limit of a request can be tested. */
  clock?: () => number
  event: JsonConfirmedEvent
  /** Whether the event type is one of Kennelliitto's own. */
  official: boolean
  organizerKcId?: number
  userName: string
  klint?: KLIntegraatio
}

interface KcTrial {
  /** The trial as it stands, with the GUID and the state this request found. */
  event: JsonConfirmedEvent
  blockers: KcBlocker[]
  koemuoto?: Awaited<ReturnType<KLIntegraatio['lueKoemuoto']>>['json']
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

const toState = (code: number, name: string, now: Date): JsonKcState => ({ code, name, readAt: now.toISOString() })

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
  ctx: KcContext,
  now: Date
): Promise<{ blocker?: KcBlocker; eventPatch?: Patch<JsonDogEvent>; kcGuid?: string }> => {
  const { event, organizerKcId } = ctx
  if (!organizerKcId) return { blocker: { code: 'noKcGuid' } }

  let choices: Awaited<ReturnType<typeof searchKcTrials>>
  try {
    choices = await searchKcTrials(klintOf(ctx), event, organizerKcId)
  } catch (error) {
    logger.warn('Kennelliitto trial search failed', { error, eventId: event.id })
    return { blocker: { code: 'kcUnavailable' } }
  }

  const [choice] = choices
  if (choices.length > 1) return { blocker: { code: 'kcGuidChoose' } }
  if (!choice?.kcGuid) return { blocker: { code: 'noKcGuid' } }
  if (await findEventWithKcGuid(choice.kcGuid, event.id)) return { blocker: { code: 'kcGuidConflict' } }

  const updatedAt = now.toISOString()
  if (await writeKcGuid(event.id, choice.kcGuid, updatedAt)) {
    await audit({ auditKey: eventAuditKey(event), ...kcGuidFoundAudit(), user: ctx.userName })
  }
  const stored = (await getEvent(event.id, true)).kcGuid
  return stored ? { eventPatch: { kcGuid: stored, updatedAt }, kcGuid: stored } : { blocker: { code: 'noKcGuid' } }
}

const stateBlocker = (code: number, name: string): KcBlocker | undefined => {
  if (isKcStateWritable(code)) return undefined
  return { code: code === KC_STATE_HANDED_OVER ? 'handedOver' : 'stateNotWritable', detail: name }
}

/**
 * The checks that concern the trial and not a dog, in the order the first sending needs them: the
 * format may be sent at all, the trial is found, Kennelliitto's state lets results in, and the format's
 * results are known. The state is stored when it differs from what was stored, so a trial the judge
 * returned unlocks and one handed over elsewhere locks.
 */
const openKcTrial = async (ctx: KcContext, { findGuid }: { findGuid: boolean }): Promise<KcTrial> => {
  const now = new Date(ctx.clock?.() ?? Date.now())
  const stop = (blocker: KcBlocker, event = ctx.event, eventPatch?: Patch<JsonDogEvent>): KcTrial => ({
    blockers: [blocker],
    event,
    ...(eventPatch ? { eventPatch } : {}),
  })

  if (!canSendResultsOfEventType(ctx.event.eventType)) return stop({ code: 'postScoredAwaitsPlacement' })
  if (!ctx.official) return stop({ code: 'notOfficial' })

  let event = ctx.event
  let eventPatch: Patch<JsonDogEvent> | undefined
  if (!event.kcGuid) {
    if (!findGuid) return stop({ code: 'noKcGuid' })
    const found = await findKcGuid(ctx, now)
    if (found.blocker || !found.kcGuid) return stop(found.blocker ?? { code: 'noKcGuid' })
    event = { ...event, kcGuid: found.kcGuid }
    eventPatch = found.eventPatch
  }
  const kcGuid = event.kcGuid
  if (!kcGuid) return stop({ code: 'noKcGuid' }, event, eventPatch)

  const klint = klintOf(ctx)
  const lue = await klint.lueKoe({ koeGuid: kcGuid })
  if (lue.status !== 200 || !lue.json) return stop(upstreamBlocker(lue.status, lue.virheet), event, eventPatch)
  if (lue.json.koemuoto !== kcFormatOfEventType(event.eventType)) {
    return stop({ code: 'koemuotoMismatch', detail: lue.json.koemuoto }, event, eventPatch)
  }

  const state = toState(lue.json.tila, lue.json.tilaNimi, now)
  if (event.kcState?.code !== state.code || event.kcState?.name !== state.name) {
    if (await writeKcState(event.id, state, state.readAt)) {
      eventPatch = { ...eventPatch, kcState: state, updatedAt: state.readAt }
    }
    event = { ...event, kcState: state }
  }
  const blocked = stateBlocker(state.code, state.name)
  if (blocked) return stop(blocked, event, eventPatch)

  const koemuoto = await klint.lueKoemuoto({ koemuoto: lue.json.koemuoto })
  if (koemuoto.status !== 200 || !koemuoto.json)
    return stop(upstreamBlocker(koemuoto.status, koemuoto.virheet), event, eventPatch)

  return { blockers: [], event, ...(eventPatch ? { eventPatch } : {}), koemuoto: koemuoto.json }
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
  const day = kcResultDay(registration)
  const problems = outcome.ok ? [] : [...outcome.problems]
  if (day && !isKcDayReached(day, now) && !problems.some((problem) => problem.code === 'dayNotReached')) {
    problems.push({ code: 'dayNotReached', detail: day })
  }
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
  const now = new Date(ctx.clock?.() ?? Date.now())
  const trial = await openKcTrial(ctx, { findGuid: true })
  const state = trial.event.kcState && { code: trial.event.kcState.code, name: trial.event.kcState.name }
  const withState = { ...(state ? { state } : {}), ...(trial.eventPatch ? { eventPatch: trial.eventPatch } : {}) }
  if (!trial.koemuoto) return { blockers: trial.blockers, dogs: [], ...withState }

  const registrations = await getReadyRegistrationsByEventId(ctx.event.id, true)
  const evaluated = evaluateAll(trial.event, selected(registrations, ids), trial.koemuoto, now)
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

/** A refusal with reasons: Kennelliitto looked at the body and said no. Anything else leaves the outcome unknown. */
const isRefusal = (status: number, virheet?: string[]) => status >= 400 && status < 500 && Boolean(virheet?.length)

const nextKcResult = (
  call: { json?: unknown; status: number; virheet?: string[] },
  sent: { hash: string; version: string },
  previous: JsonKcResult | undefined,
  by: string,
  at: string
): JsonKcResult => {
  if (call.status === 200) {
    const tulosId = tulosIdOf(call.json) ?? previous?.tulosId
    return {
      at,
      by,
      payloadHash: sent.hash,
      resultVersion: sent.version,
      status: 'sent',
      ...(tulosId === undefined ? {} : { tulosId }),
    }
  }
  const kept = {
    ...(previous?.tulosId === undefined ? {} : { tulosId: previous.tulosId }),
  }
  if (isRefusal(call.status, call.virheet)) {
    // Kennelliitto still holds whatever it accepted before, so that stays known.
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

const sendOne = async (
  ctx: KcContext,
  { body, hash, registration }: Required<Pick<Evaluated, 'body' | 'hash'>> & Pick<Evaluated, 'registration'>,
  patches: Patch<JsonRegistration>[]
): Promise<KcSendReport> => {
  const { event, userName } = ctx
  // The version is read before the call: a result saved while Kennelliitto thinks about it is a later
  // version than the one the hash stands for, and reads as changed afterwards.
  const version = registration.eventResult?.updatedAt ?? ''
  const previous = registration.kcResult
  const call = await klintOf(ctx).tallennaTulos(body)
  const next = nextKcResult(call, { hash, version }, previous, userName, new Date().toISOString())

  let written = await writeKcResult(event.id, registration.id, next, previous?.at)
  if (!written) {
    // Someone else sent the same dog meanwhile; which body Kennelliitto holds is not known any more.
    const { payloadHash: _unknown, resultVersion: _version, ...unknown } = next
    const latest = (await getRegistration(event.id, registration.id, true)).kcResult?.at
    written = await writeKcResult(event.id, registration.id, unknown, latest)
    if (!written) logger.warn('kcResult could not be recorded', { eventId: event.id, registrationId: registration.id })
    patches.push({ id: registration.id, kcResult: unknown })
  } else {
    patches.push({ id: registration.id, kcResult: next })
  }

  const auditKey = registrationAuditKey({ eventId: event.id, id: registration.id })
  if (next.status === 'sent') {
    await audit({ auditKey, ...resultSentToKennelliittoAudit(), user: userName })
  } else {
    const reason = next.errors?.join('; ') ?? `${call.status}`
    await audit({ auditKey, ...resultSendFailedAudit(reason), user: userName })
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
const keepVersion = async (ctx: KcContext, { registration }: Evaluated, patches: Patch<JsonRegistration>[]) => {
  const { kcResult } = registration
  const version = registration.eventResult?.updatedAt
  if (!kcResult || !version || kcResult.resultVersion === version) return
  const next: JsonKcResult = { ...kcResult, resultVersion: version }
  if (await writeKcResult(ctx.event.id, registration.id, next, kcResult.at)) {
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
  const clock = ctx.clock ?? Date.now
  const startedAt = clock()
  const trial = await openKcTrial(ctx, { findGuid: true })
  const patches: Patch<JsonRegistration>[] = []
  const eventPatch = trial.eventPatch && { eventPatch: trial.eventPatch }
  if (!trial.koemuoto) return { blockers: trial.blockers, notAttempted: [], patches, reports: [], ...eventPatch }

  const registrations = await getReadyRegistrationsByEventId(ctx.event.id, true)
  const evaluated = evaluateAll(trial.event, selected(registrations, ids), trial.koemuoto, new Date(startedAt))
  const notAttempted: string[] = []
  const sendCtx = { ...ctx, event: trial.event }

  const reports = await mapWithConcurrency(
    evaluated,
    SEND_CONCURRENCY,
    async (item): Promise<KcSendReport | undefined> => {
      const { body, hash, report } = item
      if (report.status === 'unchanged' && !force) {
        await keepVersion(ctx, item, patches)
        return unchangedReport(item)
      }
      if (!body || !hash || !(isSendable(report.status) || report.status === 'unchanged')) return undefined
      if (clock() - startedAt > SEND_DEADLINE_MS) {
        notAttempted.push(report.id)
        return undefined
      }
      return sendOne(sendCtx, { body, hash, registration: item.registration }, patches)
    }
  )

  return {
    blockers: [],
    notAttempted,
    patches,
    reports: reports.filter((report): report is KcSendReport => report !== undefined),
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
  handedOver: boolean
  /** Kennelliitto's refusal of the state change. */
  refused?: { status: number; virheet?: string[] }
}

const isLeftOut = ({ report }: Evaluated) =>
  report.status === 'blocked' || report.status === 'notRecorded' || report.status === 'sentGone'

const reportsOf = (items: Evaluated[]) => items.map(({ report }) => report)

/** What stands in the way of a hand-over, from the dogs as they are stored now. */
const handOverGate = (
  evaluated: Evaluated[],
  withoutBlocked: boolean
): Pick<KcHandOverResult, 'needsConfirmation' | 'unsent'> | undefined => {
  const unsent = evaluated.filter(({ report }) => isSendable(report.status))
  if (unsent.length) return { unsent: reportsOf(unsent) }
  const leftOut = evaluated.filter(isLeftOut)
  if (leftOut.length && !withoutBlocked) return { needsConfirmation: reportsOf(leftOut) }
  return undefined
}

const stored = (state: JsonKcState, eventPatch?: Patch<JsonDogEvent>): Patch<JsonDogEvent> => ({
  ...eventPatch,
  kcState: state,
  updatedAt: state.readAt,
})

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
  const clock = ctx.clock ?? Date.now
  const trial = await openKcTrial(ctx, { findGuid: false })
  const [blocker] = trial.blockers
  const eventPatch = trial.eventPatch && { eventPatch: trial.eventPatch }
  if (blocker?.code === 'handedOver') return { blockers: [], handedOver: true, ...eventPatch }
  const { koemuoto, event } = trial
  const kcGuid = event.kcGuid
  if (!koemuoto || !kcGuid) return { blockers: trial.blockers, handedOver: false, ...eventPatch }

  const evaluate = async () =>
    evaluateAll(event, await getReadyRegistrationsByEventId(event.id, true), koemuoto, new Date(clock()))
  const first = handOverGate(await evaluate(), withoutBlocked)
  if (first) return { blockers: [], handedOver: false, ...first, ...eventPatch }

  const previous = event.kcState
  const handed = toState(KC_STATE_HANDED_OVER, HANDED_OVER_NAME, new Date(clock()))
  if (!(await writeKcState(event.id, handed, handed.readAt))) {
    throw new LambdaError(409, 'The state of the trial changed meanwhile')
  }
  const release = async () => {
    if (previous)
      await writeKcState(
        event.id,
        { ...previous, readAt: new Date(clock()).toISOString() },
        new Date(clock()).toISOString()
      )
  }

  const second = handOverGate(await evaluate(), withoutBlocked)
  if (second) {
    await release()
    return { blockers: [], handedOver: false, ...second, ...eventPatch }
  }

  const call = await klintOf(ctx).asetaTila({ koeGUID: kcGuid, tila: KC_STATE_HANDED_OVER })
  if (call.status !== 200) {
    await release()
    return {
      blockers: [],
      handedOver: false,
      refused: { status: call.status, ...(call.virheet ? { virheet: call.virheet } : {}) },
      ...eventPatch,
    }
  }

  await audit({ auditKey: eventAuditKey(event), ...resultsHandedOverAudit(), user: ctx.userName })
  return { blockers: [], eventPatch: stored(handed, trial.eventPatch), handedOver: true }
}
