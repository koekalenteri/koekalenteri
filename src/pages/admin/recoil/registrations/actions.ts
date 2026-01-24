import type { PublicDogEvent, Registration, RegistrationGroupInfo } from '../../../../types'

import { useSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'

import { createRefund } from '../../../../api/payment'
import {
  getRegistrationTransactions,
  putAdminRegistration,
  putAdminRegistrationNotes,
  putRegistrationGroups,
} from '../../../../api/registration'
import { reportError } from '../../../../lib/client/error'
import { GROUP_KEY_CANCELLED } from '../../../../lib/registration'
import { idTokenAtom } from '../../../recoil'
import { adminEventSelector } from '../events'

import { adminBackgroundActionsRunningAtom } from './atoms'
import { adminEventRegistrationsSelector } from './selectors'

export const useAdminRegistrationActions = (eventId: string) => {
  const [eventRegistrations, setEventRegistrations] = useRecoilState(adminEventRegistrationsSelector(eventId))
  const [event, setEvent] = useRecoilState(adminEventSelector(eventId))
  const setBackgroundActionsRunning = useSetRecoilState(adminBackgroundActionsRunningAtom)
  const token = useRecoilValue(idTokenAtom)
  const { enqueueSnackbar } = useSnackbar()

  const updateAdminRegistration = (saved: Registration) => {
    const regs = [...eventRegistrations]
    const index = regs.findIndex((r) => r.id === saved.id)
    const insert = index === -1
    regs.splice(insert ? regs.length : index, insert ? 0 : 1, saved)
    setEventRegistrations([...regs])
  }

  return {
    async save(reg: Registration) {
      if (!token) throw new Error('missing token')
      const regWithOverrides = {
        ...reg,
        handler: reg.ownerHandles && reg.owner ? { ...reg.owner } : reg.handler,
        payer: reg.ownerPays && reg.owner ? { ...reg.owner } : reg.payer,
      }
      const saved = await putAdminRegistration(regWithOverrides, token)
      updateAdminRegistration(saved)
      return saved
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

    async cancel(eventId: string, id: string, cancelReason: string, number: number) {
      const reg = eventRegistrations.find((r) => r.id === id)
      if (!reg) throw new Error('unexpected error occured')

      await this.saveGroups(eventId, [
        { eventId, id, group: { key: GROUP_KEY_CANCELLED, number }, cancelled: true, cancelReason },
      ])
    },

    async saveGroups(eventId: string, groups: RegistrationGroupInfo[]) {
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
        } = await putRegistrationGroups(eventId, groups, token)

        if (pickedOk.length) {
          enqueueSnackbar('Koepaikkailmoitus lähetetty onnistuneesti\n\n' + pickedOk.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' },
          })
        }
        if (invitedOk.length) {
          enqueueSnackbar('Koekutsu lähetetty onnistuneesti\n\n' + invitedOk.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' },
          })
        }
        if (reserveOk.length) {
          enqueueSnackbar('Varasijailmoitus lähetetty onnistuneesti\n\n' + reserveOk.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' },
          })
        }
        if (cancelledOk.length) {
          enqueueSnackbar('Peruutusilmoitus lähetetty onnistuneesti\n\n' + reserveOk.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' },
          })
        }
        if (pickedFailed.length) {
          enqueueSnackbar('Koepaikkailmoituksen lähetys epäonnistui 💩\n\n' + pickedFailed.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' },
          })
        }
        if (invitedFailed.length) {
          enqueueSnackbar('Koekutsun lähetys epäonnistui 💩\n\n' + invitedFailed.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' },
          })
        }
        if (pickedFailed.length) {
          enqueueSnackbar('Varasijailmoituksen lähetys epäonnistui 💩\n\n' + reserveFailed.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' },
          })
        }
        if (cancelledFailed.length) {
          enqueueSnackbar('Peruutusilmoitukse lähetys epäonnistui 💩\n\n' + reserveFailed.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' },
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
        reportError(e)
        return false
      }
    },

    async transactions(eventId: PublicDogEvent['id'], registrationId: Registration['id']) {
      if (!token) throw new Error('missing token')

      return getRegistrationTransactions(eventId, registrationId, token)
    },

    async refund(reg: Registration, transactionId: string, amount: number) {
      if (!token) throw new Error('missing token')

      const result = await createRefund(transactionId, amount, token)

      if (result?.status === 'pending' || result?.status === 'ok') {
        updateAdminRegistration({
          ...reg,
          refundAt: new Date(),
          refundStatus: result?.status === 'pending' || result.provider === 'email refund' ? 'PENDING' : 'SUCCESS',
          refundAmount: (reg.refundAmount ?? 0) + amount / 100,
        })
      }

      return result
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
  }
}
