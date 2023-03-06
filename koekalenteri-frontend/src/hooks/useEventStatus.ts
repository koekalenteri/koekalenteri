import { useTranslation } from 'react-i18next'
import { Event } from 'koekalenteri-shared/model'

function getStatusKey(event: Event) {
  if (event.state === 'tentative' || event.state === 'cancelled') {
    return event.state
  }
  if (event.entryOrigEndDate) {
    return 'extended'
  }
}

export default function useEventStatus(event: Event) {
  const { t } = useTranslation()

  const statusKey = getStatusKey(event)

  return statusKey ? '(' + t(`event.states.${statusKey}_info`) + ')' : ''
}