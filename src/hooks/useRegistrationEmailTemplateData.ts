import type { DogEvent, Registration, RegistrationTemplateContext } from '../types'

import { useTranslation } from 'react-i18next'

import { getRegistrationEmailTemplateData } from '../lib/registration'

export const useRegistrationEmailTemplateData = (
  registration: Registration,
  event: DogEvent,
  context: RegistrationTemplateContext,
  text: string
) => {
  const { t } = useTranslation()

  if (!registration || !event) {
    return {}
  }

  return getRegistrationEmailTemplateData(registration, event, '', context, text, t)
}
