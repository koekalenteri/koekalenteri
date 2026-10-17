import type { TFunction } from 'i18next'
import type { EventResultSubmission } from '@/api/registration'
import type { KcBlocker, KcDogReport, KcSendReport, KcSendResponse } from '@/lib/kennelliittoResults'
import type {
  JsonKcResult,
  PublicDogEvent,
  Registration,
  RegistrationGroupMove,
  RegistrationMessage,
  StoredEventResult,
} from '@/types'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useAtomCallback } from 'jotai/utils'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { sendTemplatedEmail } from '@/api/email'
import { APIError } from '@/api/http'
import { createRefund } from '@/api/payment'
import {
  getRegistrations,
  getRegistrationTransactions,
  handOverKennelliittoResults,
  patchAdminRegistration,
  postAdminRegistration,
  previewKennelliittoResults,
  putAdminRegistrationNotes,
  putEventResults,
  putRegistrationGroups,
  sendKennelliittoResults,
} from '@/api/registration'
import { reportError } from '@/lib/client/error'
import { isTestEnv } from '@/lib/env'
import { latestCollectionUpdate, reconcileCollection } from '@/lib/incremental'
import { createPatchOperations } from '@/lib/patch'
import { GROUP_KEY_CANCELLED, withRegistrationOverrides } from '@/lib/registration'
import { isObject } from '@/lib/utils'
import { toKcResult } from '@/lib/wire'
import { validIdTokenAtom } from '@/pages/state'
import { showRegistrationSaveConflict } from '@/pages/state/registration/registrationSaveError'
import { adminEventAtom } from '../events'
import {
  adminBackgroundActionsRunningAtom,
  adminEventRegistrationsAtom,
  adminEventRegistrationsCursorAtom,
  adminEventRegistrationsFetchedAtAtom,
  adminPendingRegistrationGroupMovesAtom,
} from './atoms'
import { adminProjectedEventRegistrationsAtom } from './derivedAtoms'

const REGISTRATIONS_REFRESH_GRACE_MS = 5 * 60 * 1000

type GroupMoveCommand = {
  move: RegistrationGroupMove
  resolve: (result: false | undefined) => void
}

const registrationDebug = (message: string, details: unknown) => {
  if (!isTestEnv()) console.debug(message, details)
}

type GroupMoveResult = Awaited<ReturnType<typeof putRegistrationGroups>>
type EnqueueSnackbar = ReturnType<typeof useSnackbar>['enqueueSnackbar']

const notifyGroupMoveResult = (
  result: GroupMoveResult,
  enqueueSnackbar: EnqueueSnackbar,
  t: TFunction<'translation'>
) => {
  const notifications = [
    ['registration.notifications.groupMove.sent.picked', result.pickedOk, 'success'],
    ['registration.notifications.groupMove.sent.invitation', result.invitedOk, 'success'],
    ['registration.notifications.groupMove.sent.reserve', result.reserveOk, 'success'],
    ['registration.notifications.groupMove.sent.cancelled', result.cancelledOk, 'success'],
    ['registration.notifications.groupMove.invitationAwaitingPayment', result.invitationAwaitingPayment ?? [], 'info'],
    ['registration.notifications.groupMove.failed.picked', result.pickedFailed, 'success'],
    ['registration.notifications.groupMove.failed.invitation', result.invitedFailed, 'success'],
    ['registration.notifications.groupMove.failed.reserve', result.reserveFailed, 'success'],
    ['registration.notifications.groupMove.failed.cancelled', result.cancelledFailed, 'success'],
  ] as const

  for (const [key, recipients, variant] of notifications) {
    if (!recipients.length) continue
    enqueueSnackbar(`${t(key)}\n\n${recipients.join('\n')}`, {
      style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
      variant,
    })
  }
}

/**
 * Fold results the server has just stored into the event's registrations, so the screen that saved
 * them shows them stored without waiting for its own write to come back over the socket — and shows
 * them at all where no socket subscription is delivering it (KOE-1259 testing found both).
 */
export const useStoreEventResults = (eventId: string) =>
  useAtomCallback(
    useCallback(
      async (get, set, stored: readonly StoredEventResult[]) => {
        if (stored.length === 0) return
        const registrations = await get(adminEventRegistrationsAtom(eventId))
        set(
          adminEventRegistrationsAtom(eventId),
          registrations.map((registration) => {
            const written = stored.find((item) => item.id === registration.id)
            return written ? { ...registration, eventResult: written.eventResult } : registration
          })
        )
      },
      [eventId]
    )
  )

/**
 * Saves scores and folds what the server stored into the event's registrations in one go, so the
 * screen that saved them shows them stored without waiting for its own write to come back over the
 * socket (KOE-1343). The conflicts a save raises come back as a rejected 409, and its body carries
 * the stored side; the caller folds that in with `useStoreEventResults`.
 */
export const useSaveEventResults = (eventId: string) => {
  const token = useAtomValue(validIdTokenAtom)
  const store = useStoreEventResults(eventId)

  return useCallback(
    async (submissions: EventResultSubmission[]) => {
      const response = await putEventResults(eventId, submissions, token ?? '')
      await store([...response.saved, ...response.unchanged])

      return response
    },
    [eventId, store, token]
  )
}

/** Dogs in one sending: what the endpoint takes, and few enough to be answered within the gateway's time. */
const KC_SEND_CHUNK = 10

/** The dogs of a sending, ten at a time. */
const chunksOf = (ids: readonly string[]): string[][] =>
  Array.from({ length: Math.ceil(ids.length / KC_SEND_CHUNK) }, (_unused, index) =>
    ids.slice(index * KC_SEND_CHUNK, (index + 1) * KC_SEND_CHUNK)
  )

export interface KcSendSummary {
  blockers: KcBlocker[]
  /**
   * The sending was cut short by an error or no answer. What the dogs came to is then read from the
   * server instead of guessed, and the dogs not tried are in `notAttempted`.
   */
  interrupted: boolean
  notAttempted: string[]
  reports: KcSendReport[]
}

/** Why a hand-over did not happen, as the dialog needs it. */
export type KcHandOverOutcome =
  | { kind: 'blocked'; blockers: KcBlocker[] }
  | { kind: 'confirmationNeeded'; dogs: KcDogReport[] }
  | { kind: 'done' }
  | { kind: 'failed' }
  /** No result has been sent: handing over nothing wants the secretary's word. */
  | { kind: 'nothingSent' }
  | { kind: 'refused'; virheet: string[] }
  /** Kennelliitto gave no clear answer: whether the hand-over happened is not known. */
  | { kind: 'unknown' }
  | { kind: 'unsent'; dogs: KcDogReport[] }

const bodyOf = (error: unknown): Record<string, unknown> | undefined =>
  error instanceof APIError && isObject(error.body) ? error.body : undefined

const isBlockers = (value: unknown): value is KcBlocker[] => Array.isArray(value)

const isDogs = (value: unknown): value is KcDogReport[] => Array.isArray(value)

const blockersOf = (error: unknown): KcBlocker[] | undefined => {
  const body = bodyOf(error)
  return error instanceof APIError && error.status === 409 && isBlockers(body?.blockers) ? body.blockers : undefined
}

/** What the endpoint's refusals of a hand-over say, by the name it gives them. */
const HAND_OVER_REFUSALS: Record<string, (body: Record<string, unknown>) => KcHandOverOutcome | undefined> = {
  blocked: (body) => (isBlockers(body.blockers) ? { blockers: body.blockers, kind: 'blocked' } : undefined),
  confirmationNeeded: (body) => (isDogs(body.dogs) ? { dogs: body.dogs, kind: 'confirmationNeeded' } : undefined),
  kennelliittoRefused: (body) => {
    const virheet = Array.isArray(body.virheet) ? body.virheet.filter((item) => typeof item === 'string') : []
    return virheet.length ? { kind: 'refused', virheet } : { kind: 'unknown' }
  },
  nothingSent: () => ({ kind: 'nothingSent' }),
  unsentResults: (body) => (isDogs(body.dogs) ? { dogs: body.dogs, kind: 'unsent' } : undefined),
}

const handOverRefusal = (error: unknown): KcHandOverOutcome | undefined => {
  const body = bodyOf(error)
  const name = typeof body?.error === 'string' ? body.error : undefined
  return body && name ? HAND_OVER_REFUSALS[name]?.(body) : undefined
}

/** What a chunk's answer adds to the sending so far, and the dogs it asks to be tried again. */
const foldChunk = (summary: KcSendSummary, response: KcSendResponse): { retry: string[][]; summary: KcSendSummary } => {
  // A request that ran out of time leaves dogs for the next one, which only helps if this one got
  // somewhere; otherwise they are reported as not tried.
  const retry = response.reports.length > 0 ? chunksOf(response.notAttempted) : []
  return {
    retry,
    summary: {
      ...summary,
      notAttempted: retry.length ? summary.notAttempted : [...summary.notAttempted, ...response.notAttempted],
      reports: [...summary.reports, ...response.reports],
    },
  }
}

/**
 * Folds what sending the results to Kennelliitto came to into the event's registrations, so the page
 * that sent them shows it without waiting for the socket.
 */
const useStoreKcResults = (eventId: string) =>
  useAtomCallback(
    useCallback(
      async (get, set, stored: ReadonlyArray<{ id: string; kcResult: JsonKcResult }>) => {
        if (stored.length === 0) return
        const registrations = await get(adminEventRegistrationsAtom(eventId))
        set(
          adminEventRegistrationsAtom(eventId),
          registrations.map((registration) => {
            const written = stored.find((item) => item.id === registration.id)
            return written ? { ...registration, kcResult: toKcResult(written.kcResult) } : registration
          })
        )
      },
      [eventId]
    )
  )

/**
 * The results page's side of Kennelliitto's Omakoira (KOE-1140): the preview, the sending ten dogs at a
 * time, and the hand-over to the chief judge.
 */
export const useKennelliittoResults = (eventId: string) => {
  const token = useAtomValue(validIdTokenAtom)
  const store = useStoreKcResults(eventId)

  const reload = useAtomCallback(
    useCallback(
      async (_get, set): Promise<Registration[]> => {
        // Without a token the list cannot be read, and an empty answer would read as a trial with no dogs.
        if (!token) throw new Error('missing token')
        const registrations = await getRegistrations(eventId, token)
        set(adminEventRegistrationsAtom(eventId), registrations)
        return registrations
      },
      [eventId, token]
    )
  )

  const preview = useCallback(
    (registrationIds?: string[], signal?: AbortSignal) =>
      previewKennelliittoResults(eventId, registrationIds, token ?? '', signal),
    [eventId, token]
  )

  const sendChunks = useCallback(
    async (
      queue: string[][],
      force: boolean,
      summary: KcSendSummary,
      onProgress?: (done: number) => void
    ): Promise<KcSendSummary> => {
      const [chunk, ...rest] = queue
      if (!chunk) return summary

      let answer: { response: KcSendResponse } | { error: unknown }
      try {
        answer = { response: await sendKennelliittoResults(eventId, chunk, force, token ?? '') }
      } catch (error) {
        answer = { error }
      }
      if ('response' in answer) {
        await store(answer.response.kcResults)
        const folded = foldChunk(summary, answer.response)
        onProgress?.(folded.summary.reports.length)
        return sendChunks([...folded.retry, ...rest], force, folded.summary, onProgress)
      }

      const undelivered = [...summary.notAttempted, ...chunk, ...rest.flat()]
      const blockers = blockersOf(answer.error)
      if (blockers) return { ...summary, blockers, notAttempted: undelivered }
      // No answer, a gateway timeout or an error: some of the dogs may have been sent. Read what the
      // server holds rather than report a failure that may not be one.
      await reload().catch(reportError)
      return { ...summary, interrupted: true, notAttempted: undelivered }
    },
    [eventId, reload, store, token]
  )

  const send = useCallback(
    (registrationIds: readonly string[], force: boolean, onProgress?: (done: number) => void) =>
      sendChunks(
        chunksOf(registrationIds),
        force,
        { blockers: [], interrupted: false, notAttempted: [], reports: [] },
        onProgress
      ),
    [sendChunks]
  )

  const handOver = useCallback(
    async (withoutBlocked: boolean): Promise<KcHandOverOutcome> => {
      try {
        await handOverKennelliittoResults(eventId, withoutBlocked, token ?? '')
        return { kind: 'done' }
      } catch (error) {
        const refusal = handOverRefusal(error)
        if (refusal) return refusal
        reportError(error)
        return { kind: 'failed' }
      }
    },
    [eventId, token]
  )

  return { handOver, preview, reload, send }
}

export const useAdminRegistrationActions = (eventId: string) => {
  const [eventRegistrations, setEventRegistrations] = useAtom(adminProjectedEventRegistrationsAtom(eventId))
  const [event, setEvent] = useAtom(adminEventAtom(eventId))
  const setBackgroundActionsRunning = useSetAtom(adminBackgroundActionsRunningAtom)
  const setPendingGroupMoves = useSetAtom(adminPendingRegistrationGroupMovesAtom(eventId))
  const token = useAtomValue(validIdTokenAtom)
  const refreshInFlightRef = useRef<Promise<void> | undefined>(undefined)
  const groupMoveInFlightRef = useRef<Promise<false | undefined> | undefined>(undefined)
  const inFlightGroupMovesRef = useRef<GroupMoveCommand[]>([])
  const queuedGroupMovesRef = useRef<GroupMoveCommand[]>([])
  const eventRegistrationsRef = useRef(eventRegistrations)
  const { enqueueSnackbar } = useSnackbar()
  const { t } = useTranslation()

  useEffect(() => {
    eventRegistrationsRef.current = eventRegistrations
  }, [eventRegistrations])

  const refreshIfStale = useAtomCallback(
    useCallback(
      async (get, set) => {
        if (!eventId) return

        if (refreshInFlightRef.current) {
          registrationDebug('registrations: refresh coalesced', { eventId })
          return refreshInFlightRef.current
        }

        const refresh = (async () => {
          const currentToken = get(validIdTokenAtom)
          const fetchedAt = get(adminEventRegistrationsFetchedAtAtom(eventId))
          const storedCursor = get(adminEventRegistrationsCursorAtom(eventId))
          const registrations = await get(adminEventRegistrationsAtom(eventId))
          if (!currentToken) return

          const now = new Date()
          const derivedCursor = storedCursor ?? latestCollectionUpdate(registrations)
          if (!fetchedAt) {
            set(adminEventRegistrationsFetchedAtAtom(eventId), now)
            if (derivedCursor) set(adminEventRegistrationsCursorAtom(eventId), derivedCursor)
            return
          }
          if (now.getTime() - fetchedAt.getTime() < REGISTRATIONS_REFRESH_GRACE_MS) return

          const since = derivedCursor ?? fetchedAt
          const startedAt = Date.now()
          registrationDebug('registrations: refresh started', {
            eventId,
            fetchedAt: fetchedAt.toISOString(),
            since: since.toISOString(),
          })

          const response = await getRegistrations(eventId, currentToken, undefined, since)
          if (Array.isArray(response)) {
            set(adminEventRegistrationsAtom(eventId), response)
            const nextCursor = latestCollectionUpdate(response)
            if (nextCursor) set(adminEventRegistrationsCursorAtom(eventId), nextCursor)
          } else {
            set(adminEventRegistrationsCursorAtom(eventId), new Date(response.cursor))
            set(adminEventRegistrationsAtom(eventId), (current) => reconcileCollection(current, response))
          }
          set(adminEventRegistrationsFetchedAtAtom(eventId), new Date())
          registrationDebug('registrations: refresh completed', {
            cursor: Array.isArray(response) ? latestCollectionUpdate(response)?.toISOString() : response.cursor,
            deleted: Array.isArray(response) ? 0 : response.deletedIds.length,
            durationMs: Date.now() - startedAt,
            eventId,
            received: Array.isArray(response) ? response.length : response.items.length,
          })
        })().finally(() => {
          if (refreshInFlightRef.current === refresh) {
            refreshInFlightRef.current = undefined
          }
        })

        refreshInFlightRef.current = refresh
        return refresh
      },
      [eventId]
    )
  )

  const updateAdminRegistrations = (updated: Registration[]) => {
    const regs = [...eventRegistrations]
    for (const reg of updated) {
      const index = regs.findIndex((r) => r.id === reg.id)
      const insert = index === -1
      regs.splice(insert ? regs.length : index, insert ? 0 : 1, reg)
    }
    void setEventRegistrations([...regs])
  }

  const updateAdminRegistration = (saved: Registration) => updateAdminRegistrations([saved])

  const registrationClassForMove = (move: RegistrationGroupMove) =>
    eventRegistrationsRef.current.find((registration) => registration.id === move.id)?.class ?? ''

  const saveGroups = async (
    targetEventId: string,
    groups: RegistrationGroupMove[],
    commands: GroupMoveCommand[] = []
  ): Promise<false | undefined> => {
    // Send the first move immediately. Moves made while it is in flight are
    // projected locally and sent together as the next request.
    if (groupMoveInFlightRef.current) {
      const queued = groups.map(
        (move) =>
          new Promise<false | undefined>((resolve) => {
            queuedGroupMovesRef.current.push({ move, resolve })
          })
      )
      setPendingGroupMoves((current) => [...current, ...groups])
      const results = await Promise.all(queued)
      return results.includes(false) ? false : undefined
    }

    setPendingGroupMoves((current) => [...current, ...groups])
    // The immediate first batch has no waiting callers, but it still needs
    // command records so completion removes its optimistic projection.
    inFlightGroupMovesRef.current =
      commands.length > 0 ? commands : groups.map((move) => ({ move, resolve: () => undefined }))

    let failed = false
    const run = (async () => {
      try {
        if (!token) throw new Error('missing token')

        setBackgroundActionsRunning(true)

        const result = await putRegistrationGroups(targetEventId, groups, token)
        const { items, classes, entries } = result
        notifyGroupMoveResult(result, enqueueSnackbar, t)
        // Defensive against backend returning sparse arrays / null items.
        // MUI X v7 will crash if `rows` contains nullish entries.
        const confirmed = (items as Array<Registration | null | undefined>).filter(Boolean) as Registration[]
        const completed = new Set(inFlightGroupMovesRef.current.map((command) => command.move))
        setPendingGroupMoves((current) => current.filter((move) => !completed.has(move)))
        inFlightGroupMovesRef.current.forEach((command) => {
          command.resolve(undefined)
        })
        await setEventRegistrations(confirmed)
        await setEvent({ ...event, classes, entries })
        setBackgroundActionsRunning(false)
      } catch (e) {
        failed = true
        // A failed request can be ambiguous (for example a dropped response).
        // Discard every local command as one unit and reload the authoritative
        // snapshot instead of letting later commands consume the wrong prefix.
        inFlightGroupMovesRef.current.forEach((command) => {
          command.resolve(false)
        })
        queuedGroupMovesRef.current.splice(0).forEach((command) => {
          command.resolve(false)
        })
        setPendingGroupMoves([])
        if (token) {
          try {
            const latest = await getRegistrations(targetEventId, token)
            if (Array.isArray(latest)) await setEventRegistrations(latest)
          } catch (refreshError) {
            console.error('Unable to refresh registrations after group move failure', refreshError)
          }
        }
        setBackgroundActionsRunning(false)
        reportError(e)
        return false
      }
    })()

    groupMoveInFlightRef.current = run
    void run
      .then((result) => {
        if (result === false) return
        const queued = queuedGroupMovesRef.current.splice(0)
        const nextClass = queued[0] ? registrationClassForMove(queued[0].move) : undefined
        const nextBatch = queued.filter((command) => registrationClassForMove(command.move) === nextClass)
        queuedGroupMovesRef.current.push(
          ...queued.filter((command) => registrationClassForMove(command.move) !== nextClass)
        )
        if (nextBatch.length) {
          const nextBatchSet = new Set(nextBatch.map((command) => command.move))
          setPendingGroupMoves((current) => current.filter((move) => !nextBatchSet.has(move)))
          groupMoveInFlightRef.current = undefined
          void saveGroups(
            targetEventId,
            nextBatch.map((command) => command.move),
            nextBatch
          )
        }
      })
      .finally(() => {
        if (groupMoveInFlightRef.current !== run) return
        groupMoveInFlightRef.current = undefined

        // Commands added while the authoritative refresh was in progress were
        // intentionally not part of the failed batch. Start them once recovery
        // has completed rather than leaving their optimistic projection stuck.
        if (failed) {
          const queued = queuedGroupMovesRef.current.splice(0)
          if (queued.length) {
            // saveGroups adds its submitted batch to the pending overlay. Remove
            // this already-projected copy first so recovery does not duplicate it.
            const queuedSet = new Set(queued.map((command) => command.move))
            setPendingGroupMoves((current) => current.filter((move) => !queuedSet.has(move)))
            void saveGroups(
              targetEventId,
              queued.map((command) => command.move),
              queued
            )
          }
        }
      })
    return run
  }

  return {
    async cancel(eventId: string, id: string, cancelReason: string) {
      if (!eventRegistrations.some((r) => r.id === id)) throw new Error('unexpected error occured')

      await saveGroups(eventId, [{ cancelReason, group: { key: GROUP_KEY_CANCELLED }, id }])
    },

    async putInternalNotes(
      eventId: Registration['eventId'],
      id: Registration['id'],
      internalNotes: Registration['internalNotes']
    ) {
      if (!token) throw new Error('missing token')

      const reg = eventRegistrations.find((r) => r.id === id)
      if (!reg) throw new Error('unexpected error occured')

      await putAdminRegistrationNotes({ eventId, id, internalNotes }, token)
      updateAdminRegistration({ ...reg, internalNotes })
    },

    refreshIfStale,

    async refund(reg: Registration, transactionId: string, amount: number, handlingCost: number) {
      if (!token) throw new Error('missing token')

      const result = await createRefund(transactionId, amount, handlingCost, token)

      if (result?.status === 'pending' || result?.status === 'ok') {
        // The row reads at once as it will once the refund is applied: the amount and the handling fee
        // kept from it go together, or a reserve whose fee is on its way back would read as owing the
        // kept part in the meantime (KOE-1526). A pending or emailed refund is not written SUCCESS any
        // more -- the server only applies it, with the real amounts, once refundSuccess actually
        // settles it -- so this mirrors the server: `openRefunds` carries the "still open" mark for
        // PaymentIcon/RegistrationTooltipContent instead, and refundStatus is left alone (KOE-1529).
        // The server ADDs to openRefunds for every refund it creates, synchronous ones included --
        // only refundStatus SUCCESS is withheld for a pending or emailed one.
        const isPendingRefund = result.status === 'pending' || result.provider === 'email refund'
        updateAdminRegistration({
          ...reg,
          openRefunds: [...(reg.openRefunds ?? []), result.transactionId],
          refundAmount: (reg.refundAmount ?? 0) + amount / 100,
          refundAt: new Date(),
          refundHandlingCost: (reg.refundHandlingCost ?? 0) + handlingCost / 100,
          ...(isPendingRefund ? {} : { refundStatus: 'SUCCESS' }),
        })
      }

      return result
    },
    async save(reg: Registration, savedRegistration?: Registration) {
      if (!token) throw new Error('missing token')
      const regWithOverrides = withRegistrationOverrides(reg)
      let saved: Registration
      try {
        if (savedRegistration) {
          saved = await patchAdminRegistration(
            {
              eventId: reg.eventId,
              id: reg.id,
              modifiedAt: savedRegistration.modifiedAt,
              operations: createPatchOperations(savedRegistration, regWithOverrides),
            },
            token
          )
        } else {
          const { editToken: _editToken, ...request } = regWithOverrides
          saved = await postAdminRegistration(request, token)
        }
      } catch (error) {
        if (event && showRegistrationSaveConflict(error, { enqueueSnackbar, event, registration: reg, t })) {
          return undefined
        }
        throw error
      }
      updateAdminRegistration(saved)
      return saved
    },

    saveGroups,
    /**
     * A templated message to the chosen registrations. What the server changed while sending — the
     * registrations' delivery state, the event's own state and class states — is stored here, so the
     * list shows the sent marks without waiting for the socket (KOE-1343).
     *
     * The start list flag comes back with them. Sending the invitations settles an absent flag to
     * false on the server, and the copy stored here replaces the one the socket patched, so leaving
     * the flag out kept the panel reading the list as public until the next save answered with the
     * truth — and that answer looked like the save had hidden the list (KOE-1432).
     */
    async sendMessage(message: RegistrationMessage) {
      if (!token) throw new Error('missing token')

      const { classes, failed, ok, registrations, startListPublished, state } = await sendTemplatedEmail(message, token)
      await setEvent({ ...event, classes, startListPublished, state })
      updateAdminRegistrations(registrations)

      return { failed, ok }
    },

    async transactions(eventId: PublicDogEvent['id'], registrationId: Registration['id']) {
      if (!token) throw new Error('missing token')

      return getRegistrationTransactions(eventId, registrationId, token)
    },

    update: updateAdminRegistrations,
  }
}
