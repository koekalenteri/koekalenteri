import type { Patch, PublicDogEvent, Registration, RegistrationGroupInfo } from '../../../../types'
import { useSnackbar } from 'notistack'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilCallback, useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'
import { createRefund } from '../../../../api/payment'
import {
  getRegistrations,
  getRegistrationTransactions,
  putAdminRegistration,
  putAdminRegistrationNotes,
  putRegistrationGroups,
} from '../../../../api/registration'
import { reportError } from '../../../../lib/client/error'
import { isTestEnv } from '../../../../lib/env'
import { latestCollectionUpdate, reconcileCollection } from '../../../../lib/incremental'
import { GROUP_KEY_CANCELLED } from '../../../../lib/registration'
import { validIdTokenSelector } from '../../../recoil'
import { showRegistrationSaveConflict } from '../../../recoil/registration/registrationSaveError'
import { adminEventSelector } from '../events'
import {
  adminBackgroundActionsRunningAtom,
  adminEventRegistrationsAtom,
  adminEventRegistrationsCursorAtom,
  adminEventRegistrationsFetchedAtAtom,
} from './atoms'
import { adminEventRegistrationsSelector } from './selectors'

const REGISTRATIONS_REFRESH_GRACE_MS = 5 * 60 * 1000

const registrationDebug = (message: string, details: unknown) => {
  if (!isTestEnv()) console.debug(message, details)
}

export const useAdminRegistrationActions = (eventId: string) => {
  const [eventRegistrations, setEventRegistrations] = useRecoilState(adminEventRegistrationsSelector(eventId))
  const [event, setEvent] = useRecoilState(adminEventSelector(eventId))
  const setBackgroundActionsRunning = useSetRecoilState(adminBackgroundActionsRunningAtom)
  const token = useRecoilValue(validIdTokenSelector)
  const refreshInFlightRef = useRef<Promise<void> | undefined>(undefined)
  const { enqueueSnackbar } = useSnackbar()
  const { t } = useTranslation()

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

  const saveGroups = async (targetEventId: string, groups: RegistrationGroupInfo[]) => {
    try {
      if (!token) throw new Error('missing token')

      // early update for respinsiveness
      const regs = [...eventRegistrations]
      for (const group of groups) {
        const index = regs.findIndex((r) => r.id === group.id)
        if (index === -1) continue
        const reg = regs[index]
        regs.splice(index, 1, { ...reg, ...group })
      }
      setEventRegistrations([...regs])
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
      if (pickedFailed.length) {
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
      setEventRegistrations((items as Array<Registration | null | undefined>).filter(Boolean) as Registration[])
      if (event) {
        setEvent({ ...event, classes, entries })
      }
      setBackgroundActionsRunning(false)
    } catch (e) {
      setBackgroundActionsRunning(false)
      reportError(e)
      return false
    }
  }

  return {
    async cancel(eventId: string, id: string, cancelReason: string, number: number) {
      const reg = eventRegistrations.find((r) => r.id === id)
      if (!reg) throw new Error('unexpected error occured')

      await saveGroups(eventId, [
        { cancelled: true, cancelReason, eventId, group: { key: GROUP_KEY_CANCELLED, number }, id },
      ])
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
    async save(reg: Registration, formChanges?: Patch<Registration>) {
      if (!token) throw new Error('missing token')
      const regWithOverrides = {
        ...reg,
        handler: reg.ownerHandles && reg.owner ? { ...reg.owner } : reg.handler,
        payer: reg.ownerPays && reg.owner ? { ...reg.owner } : reg.payer,
      }
      const request = formChanges
        ? {
            ...formChanges,
            eventId: reg.eventId,
            id: reg.id,
            ...('owner' in formChanges || 'ownerHandles' in formChanges ? { handler: regWithOverrides.handler } : {}),
            ...('owner' in formChanges || 'ownerPays' in formChanges ? { payer: regWithOverrides.payer } : {}),
          }
        : regWithOverrides
      let saved: Registration
      try {
        saved = await putAdminRegistration(request, token)
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
