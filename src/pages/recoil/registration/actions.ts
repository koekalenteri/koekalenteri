import type { Registration } from '../../../types'

import { useTranslation } from 'react-i18next'
import { useSnackbar } from 'notistack'

import { putRegistration } from '../../../api/registration'

export function useRegistrationActions() {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()

  return {
    save: async (reg: Registration) => {
      const saved = await putRegistration(reg.ownerHandles ? { ...reg, handler: { ...reg.owner } } : reg)
      const emails = [saved.handler.email]
      if (saved.owner.email !== saved.handler.email) {
        emails.push(saved.owner.email)
      }
      enqueueSnackbar(
        t(reg.id ? 'registration.modified' : 'registration.saved', {
          count: emails.length,
          to: emails.join('\n'),
        }),
        { variant: 'success', style: { whiteSpace: 'pre-line' } }
      )
      return saved
    },

    cancel: async (reg: Registration) => {
      const mod = structuredClone(reg)
      mod.cancelled = true
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
  }
}
