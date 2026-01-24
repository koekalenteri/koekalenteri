import type { TFunction } from 'i18next'
import type { DogEvent } from '../types'
import { useTranslation } from 'react-i18next'
import { isConfirmedEvent } from '../lib/typeGuards'
import { isEntryClosed, isEntryOpen, isEventOngoing, isEventOver } from '../lib/utils'

export function getEventTitle(event: DogEvent, t: TFunction<'translation'>): string {
  if (isConfirmedEvent(event)) {
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

export default function useEventTitle(event: DogEvent): string {
  const { t } = useTranslation()

  return getEventTitle(event, t)
}
