import type { PublicDogEvent, Registration, RegistrationGroupMove } from '../../../../types'
import { useSnackbar } from 'notistack'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilCallback, useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'
import { createRefund } from '../../../../api/payment'
import {
  getRegistrations,
  getRegistrationTransactions,
  patchAdminRegistration,
  postAdminRegistration,
  putAdminRegistrationNotes,
  putRegistrationGroups,
} from '../../../../api/registration'
import { reportError } from '../../../../lib/client/error'
import { isTestEnv } from '../../../../lib/env'
import { latestCollectionUpdate, reconcileCollection } from '../../../../lib/incremental'
import { createPatchOperations } from '../../../../lib/patch'
import { GROUP_KEY_CANCELLED } from '../../../../lib/registration'
import { validIdTokenSelector } from '../../../recoil'
import { showRegistrationSaveConflict } from '../../../recoil/registration/registrationSaveError'
import { adminEventSelector } from '../events'
import {
  adminBackgroundActionsRunningAtom,
  adminEventRegistrationsAtom,
  adminEventRegistrationsCursorAtom,
  adminEventRegistrationsFetchedAtAtom,
  adminPendingRegistrationGroupMovesAtom,
} from './atoms'
import { adminEventRegistrationsSelector } from './selectors'

const REGISTRATIONS_REFRESH_GRACE_MS = 5 * 60 * 1000

type GroupMoveCommand = {
  move: RegistrationGroupMove
  resolve: (result: false | undefined) => void
}

const registrationDebug = (message: string, details: unknown) => {
  if (!isTestEnv()) console.debug(message, details)
}

export const useAdminRegistrationActions = (eventId: string) => {
  const [eventRegistrations, setEventRegistrations] = useRecoilState(adminEventRegistrationsSelector(eventId))
  const [event, setEvent] = useRecoilState(adminEventSelector(eventId))
  const setBackgroundActionsRunning = useSetRecoilState(adminBackgroundActionsRunningAtom)
  const setPendingGroupMoves = useSetRecoilState(adminPendingRegistrationGroupMovesAtom(eventId))
  const token = useRecoilValue(validIdTokenSelector)
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

  const refreshIfStale = useRecoilCallback(
    ({ set, snapshot }) =>
      async () => {
        if (!eventId) return

        if (refreshInFlightRef.current) {
          registrationDebug('registrations: refresh coalesced', { eventId })
          return refreshInFlightRef.current
        }

        const refresh = (async () => {
          const [currentToken, registrations, fetchedAt, storedCursor] = await Promise.all([
            snapshot.getPromise(validIdTokenSelector),
            snapshot.getPromise(adminEventRegistrationsAtom(eventId)),
            snapshot.getPromise(adminEventRegistrationsFetchedAtAtom(eventId)),
            snapshot.getPromise(adminEventRegistrationsCursorAtom(eventId)),
          ])
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

  const updateAdminRegistration = (saved: Registration) => {
    const regs = [...eventRegistrations]
    const index = regs.findIndex((r) => r.id === saved.id)
    const insert = index === -1
    regs.splice(insert ? regs.length : index, insert ? 0 : 1, saved)
    setEventRegistrations([...regs])
  }

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

        const {
          items,
          classes,
          entries,
          invitedOk,
          invitedFailed,
          pickedOk,
          pickedFailed,
          reserveOk,
          reserveFailed,
          cancelledOk,
          cancelledFailed,
        } = await putRegistrationGroups(targetEventId, groups, token)

        if (pickedOk.length) {
          enqueueSnackbar(`Koepaikkailmoitus lähetetty onnistuneesti\n\n${pickedOk.join('\n')}`, {
            style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
            variant: 'success',
          })
        }
        if (invitedOk.length) {
          enqueueSnackbar(`Koekutsu lähetetty onnistuneesti\n\n${invitedOk.join('\n')}`, {
            style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
            variant: 'success',
          })
        }
        if (reserveOk.length) {
          enqueueSnackbar(`Varasijailmoitus lähetetty onnistuneesti\n\n${reserveOk.join('\n')}`, {
            style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
            variant: 'success',
          })
        }
        if (cancelledOk.length) {
          enqueueSnackbar(`Peruutusilmoitus lähetetty onnistuneesti\n\n${cancelledOk.join('\n')}`, {
            style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
            variant: 'success',
          })
        }
        if (pickedFailed.length) {
          enqueueSnackbar(`Koepaikkailmoituksen lähetys epäonnistui 💩\n\n${pickedFailed.join('\n')}`, {
            style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
            variant: 'success',
          })
        }
        if (invitedFailed.length) {
          enqueueSnackbar(`Koekutsun lähetys epäonnistui 💩\n\n${invitedFailed.join('\n')}`, {
            style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
            variant: 'success',
          })
        }
        if (reserveFailed.length) {
          enqueueSnackbar(`Varasijailmoituksen lähetys epäonnistui 💩\n\n${reserveFailed.join('\n')}`, {
            style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
            variant: 'success',
          })
        }
        if (cancelledFailed.length) {
          enqueueSnackbar(`Peruutusilmoituksen lähetys epäonnistui 💩\n\n${cancelledFailed.join('\n')}`, {
            style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
            variant: 'success',
          })
        }
        // Defensive against backend returning sparse arrays / null items.
        // MUI X v7 will crash if `rows` contains nullish entries.
        const confirmed = (items as Array<Registration | null | undefined>).filter(Boolean) as Registration[]
        const completed = new Set(inFlightGroupMovesRef.current.map((command) => command.move))
        setPendingGroupMoves((current) => current.filter((move) => !completed.has(move)))
        inFlightGroupMovesRef.current.forEach((command) => {
          command.resolve(undefined)
        })
        setEventRegistrations(confirmed)
        if (event) {
          setEvent({ ...event, classes, entries })
        }
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
            if (Array.isArray(latest)) setEventRegistrations(latest)
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
        const refundSucceeded = result.status === 'ok' && result.provider !== 'email refund'

        updateAdminRegistration({
          ...reg,
          refundAmount: (reg.refundAmount ?? 0) + amount / 100,
          refundAt: new Date(),
          ...(refundSucceeded ? { refundHandlingCost: (reg.refundHandlingCost ?? 0) + handlingCost / 100 } : {}),
          refundStatus: result?.status === 'pending' || result.provider === 'email refund' ? 'PENDING' : 'SUCCESS',
        })
      }

      return result
    },
    async save(reg: Registration, savedRegistration?: Registration) {
      if (!token) throw new Error('missing token')
      const regWithOverrides = {
        ...reg,
        handler: reg.ownerHandles && reg.owner ? { ...reg.owner } : reg.handler,
        payer: reg.ownerPays && reg.owner ? { ...reg.owner } : reg.payer,
      }
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

    async transactions(eventId: PublicDogEvent['id'], registrationId: Registration['id']) {
      if (!token) throw new Error('missing token')

      return getRegistrationTransactions(eventId, registrationId, token)
    },

    update(updated: Registration[]) {
      const regs = [...eventRegistrations]
      for (const reg of updated) {
        const index = regs.findIndex((r) => r.id === reg.id)
        const insert = index === -1
        regs.splice(insert ? regs.length : index, insert ? 0 : 1, reg)
      }
      setEventRegistrations([...regs])
    },
  }
}
