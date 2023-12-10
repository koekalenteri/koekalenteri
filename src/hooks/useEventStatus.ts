import type { PublicDogEvent } from '../types'

import { useTranslation } from 'react-i18next'

function getStatusKey(event: PublicDogEvent) {
  if (event.state === 'tentative' || event.state === 'cancelled') {
    return event.state
  }
  if (event.entryOrigEndDate) {
    return 'extended'
  }
}

export default function useEventStatus(event: PublicDogEvent) {
  const { t } = useTranslation()

  const statusKey = getStatusKey(event)

  return statusKey ? '(' + t(`event.states.${statusKey}_info`) + ')' : ''
}
