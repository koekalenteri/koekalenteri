import type { TFunction } from 'i18next'
import type { OptionsObject, SnackbarMessage } from 'notistack'
import type { ContactInfo, Registration } from '../../../types'
import { APIError } from '../../../api/http'
import { errorSnackbarOptions } from '../../../lib/snackbar'
import { isObject, printContactInfo } from '../../../lib/utils'

interface RegistrationSaveErrorOptions {
  enqueueSnackbar: (message: SnackbarMessage, options?: OptionsObject) => void
  event: { contactInfo?: Partial<ContactInfo> }
  registration: Registration
  t: TFunction
}

export const showRegistrationSaveConflict = (
  error: unknown,
  { enqueueSnackbar, event, registration, t }: RegistrationSaveErrorOptions
) => {
  if (!(error instanceof APIError) || error.status !== 409) return false

  if (isObject(error.body) && error.body.error === 'emailSuppressed') {
    enqueueSnackbar(
      t('registration.notifications.emailSuppressed', {
        email: error.body.email,
        reason: error.body.reason,
      }),
      errorSnackbarOptions
    )
    return true
  }

  if (isObject(error.body) && error.body.error === 'staleData') {
    enqueueSnackbar(t('registration.notifications.staleData'), errorSnackbarOptions)
    return true
  }

  enqueueSnackbar(
    t('registration.notifications.alreadyRegistered', {
      contact: printContactInfo(event.contactInfo?.secretary),
      context: isObject(error.body) && error.body.cancelled ? 'cancel' : undefined,
      reg: registration,
    }),
    { persist: true, variant: 'info' }
  )
  return true
}
