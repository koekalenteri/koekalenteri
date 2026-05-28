import type { ConfirmedEvent, Registration } from '../../../types'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { APIError } from '../../../api/http'
import { getRegistration, putRegistration } from '../../../api/registration'
import { showRegistrationSaveConflict } from './registrationSaveError'

export function useRegistrationActions() {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()

  return {
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
      let saved: Registration
      try {
        saved = await putRegistration(mod)
      } catch (error) {
        if (error instanceof APIError && error.status === 304) {
          saved = mod
        } else {
          throw error
        }
      }
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
    save: async (reg: Registration, event: ConfirmedEvent) => {
      const regWithOverrides: Registration = {
        ...reg,
        handler: reg.ownerHandles && reg.owner ? { ...reg.owner } : reg.handler,
        payer: reg.ownerPays && reg.owner ? { ...reg.owner } : reg.payer,
      }
      let saved: Registration
      try {
        saved = await putRegistration(regWithOverrides)
      } catch (error) {
        if (showRegistrationSaveConflict(error, { enqueueSnackbar, event, registration: reg, t })) return undefined
        throw error
      }
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
          { style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' }, variant: 'success' }
        )
      }
      return saved
    },
  }
}
