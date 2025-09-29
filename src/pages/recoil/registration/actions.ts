import type { Registration } from '../../../types'

import { useTranslation } from 'react-i18next'
import { useSnackbar } from 'notistack'

import { getRegistration, putRegistration } from '../../../api/registration'

export function useRegistrationActions() {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()

  return {
    save: async (reg: Registration) => {
      const regWithOverrides: Registration = {
        ...reg,
        handler: reg.ownerHandles && reg.owner ? { ...reg.owner } : reg.handler,
        payer: reg.ownerPays && reg.owner ? { ...reg.owner } : reg.payer,
      }
      const saved = await putRegistration(regWithOverrides)
      const emails = [saved.handler?.email]
      if (saved.owner?.email !== saved.handler?.email) {
        emails.push(saved.owner?.email)
      }
      if (reg.paymentStatus === 'SUCCESS') {
        enqueueSnackbar(
          t(reg.id ? 'registration.modified' : 'registration.saved', {
            count: emails.length,
            to: emails.join('\n'),
          }),
          { variant: 'success', style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' } }
        )
      }
      return saved
    },

    cancel: async (reg: Registration, reason: string) => {
      const mod = structuredClone(reg)
      mod.cancelled = true
      mod.cancelReason = reason
      const saved = await putRegistration(mod)
      enqueueSnackbar(t('registration.cancelDialog.done'), { variant: 'info' })
      return saved
    },

    confirm: async (reg: Registration) => {
      const mod = structuredClone(reg)
      mod.confirmed = true
      const saved = await putRegistration(mod)
      enqueueSnackbar(t('registration.confirmDialog.done'), { variant: 'info' })
      return saved
    },

    invitationRead: async (reg: Registration) => {
      if (reg.invitationRead) return reg
      const mod = structuredClone(reg)
      mod.invitationRead = true
      const saved = await putRegistration(mod)
      return saved
    },

    reload: async ({ eventId, id }: Pick<Registration, 'eventId' | 'id'>) => {
      const reg = await getRegistration(eventId, id)

      return reg
    },
  }
}
