import { useTranslation } from 'react-i18next'
import { TFunction } from 'i18next'
import { Event } from 'koekalenteri-shared/model'

import { isEntryClosed, isEntryOpen, isEventOngoing, isEventOver } from '../utils'

export function getEventTitle(event: Event, t: TFunction<'translation'>) {
  if (event.state === 'confirmed') {
    if (isEventOver(event)) {
      return t('event.states.confirmed_eventOver')
    }
    if (isEntryOpen(event)) {
      return t('event.states.confirmed_entryOpen')
    }
    if (isEntryClosed(event)) {
      return t('event.states.confirmed_entryClosed')
    }
    if (isEventOngoing(event)) {
      return t('event.states.confirmed_eventOngoing')
    }
  }

  return t(`event.states.${event.state || 'draft'}`)
}

export default function useEventTitle(event: Event) {
  const { t } = useTranslation()

  return getEventTitle(event, t)
}
