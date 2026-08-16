import type { ConfirmedEvent, Registration, RegistrationPatchRequest } from '../../../types'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { APIError } from '../../../api/http'
import { getRegistration, patchRegistration, postRegistration } from '../../../api/registration'
import { createPatchOperations } from '../../../lib/patch'
import { PUBLIC_REGISTRATION_OPERATION_FIELDS } from '../../../lib/registration'
import { showRegistrationSaveConflict } from './registrationSaveError'

const withRegistrationOverrides = (reg: Registration): Registration => ({
  ...reg,
  handler: reg.ownerHandles && reg.owner ? { ...reg.owner } : reg.handler,
  payer: reg.ownerPays && reg.owner ? { ...reg.owner } : reg.payer,
})

const publicRegistrationOperationData = (registration: Registration): Partial<Registration> => {
  const result: Partial<Registration> = {}
  for (const field of PUBLIC_REGISTRATION_OPERATION_FIELDS) {
    if (Object.hasOwn(registration, field)) Object.assign(result, { [field]: registration[field] })
  }
  return result
}

const registrationPatch = (saved: Registration, edited: Registration): RegistrationPatchRequest => ({
  eventId: edited.eventId,
  id: edited.id,
  operations: createPatchOperations(publicRegistrationOperationData(saved), publicRegistrationOperationData(edited)),
})

export function useRegistrationActions() {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()

  return {
    cancel: async (reg: Registration, reason: string) => {
      const saved = await patchRegistration(registrationPatch(reg, { ...reg, cancelled: true, cancelReason: reason }))
      enqueueSnackbar(t('registration.cancelDialog.done'), { variant: 'info' })
      return saved
    },

    confirm: async (reg: Registration) => {
      const mod = { ...reg, confirmed: true }
      let saved: Registration
      try {
        saved = await patchRegistration(registrationPatch(reg, mod))
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
      const mod = { ...reg, invitationRead: true }
      const saved = await patchRegistration(registrationPatch(reg, mod))
      return saved
    },

    reload: async ({ eventId, id }: Pick<Registration, 'eventId' | 'id'>) => {
      const reg = await getRegistration(eventId, id)

      return reg
    },
    save: async (reg: Registration, event: ConfirmedEvent, savedRegistration?: Registration | null) => {
      const regWithOverrides = withRegistrationOverrides(reg)
      let saved: Registration
      try {
        if (savedRegistration) {
          saved = await patchRegistration(registrationPatch(savedRegistration, regWithOverrides))
        } else {
          const { editToken: _editToken, ...request } = regWithOverrides
          saved = await postRegistration(request)
        }
      } catch (error) {
        if (error instanceof APIError && error.status === 304) {
          saved = regWithOverrides
        } else if (showRegistrationSaveConflict(error, { enqueueSnackbar, event, registration: reg, t })) {
          return undefined
        } else {
          throw error
        }
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
