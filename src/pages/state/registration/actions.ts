import type { ConfirmedEvent, Registration, RegistrationPatchRequest } from '../../../types'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { APIError } from '../../../api/http'
import { getRegistration, patchRegistration, postRegistration } from '../../../api/registration'
import { createPatchOperations } from '../../../lib/patch'
import {
  getRegistrationEmails,
  PUBLIC_REGISTRATION_OPERATION_FIELDS,
  withRegistrationOverrides,
} from '../../../lib/registration'
import { showRegistrationSaveConflict } from './registrationSaveError'

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
      const saved = await patchRegistration(
        registrationPatch(reg, { ...reg, cancelled: true, cancelReason: reason }),
        reg.editToken
      )
      enqueueSnackbar(t('registration.cancelDialog.done'), { variant: 'info' })
      return saved
    },

    confirm: async (reg: Registration, event: ConfirmedEvent) => {
      const mod = { ...reg, confirmed: true }
      let saved: Registration
      try {
        saved = await patchRegistration(registrationPatch(reg, mod), reg.editToken)
      } catch (error) {
        if (error instanceof APIError && error.status === 304) {
          saved = mod
        } else if (showRegistrationSaveConflict(error, { enqueueSnackbar, event, registration: reg, t })) {
          return undefined
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
      const saved = await patchRegistration(registrationPatch(reg, mod), reg.editToken)
      return saved
    },

    reload: async ({ eventId, id }: Pick<Registration, 'eventId' | 'id'>) => getRegistration(eventId, id),

    save: async (reg: Registration, event: ConfirmedEvent, savedRegistration?: Registration | null) => {
      const regWithOverrides = withRegistrationOverrides(reg)
      let saved: Registration
      try {
        if (savedRegistration) {
          saved = await patchRegistration(
            registrationPatch(savedRegistration, regWithOverrides),
            savedRegistration.editToken
          )
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
      const emails = getRegistrationEmails(saved)
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
