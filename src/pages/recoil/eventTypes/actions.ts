import type { EventType } from '../../../types'

import i18next from 'i18next'
import { useRecoilState, useRecoilValue } from 'recoil'

import { getEventTypes, putEventType } from '../../../api/eventType'
import { idTokenAtom } from '../user'

import { eventTypesAtom } from './atoms'

export const useEventTypeActions = () => {
  const [eventTypes, setEventTypes] = useRecoilState(eventTypesAtom)
  const token = useRecoilValue(idTokenAtom)

  return {
    refresh,
    save,
  }

  async function refresh() {
    const eventTypes = await getEventTypes(true)
    const sortedEventTypes = [...eventTypes].sort((a, b) => a.eventType.localeCompare(b.eventType, i18next.language))
    setEventTypes(sortedEventTypes)
  }

  async function save(eventType: EventType) {
    const index = eventTypes.findIndex((j) => j.eventType === eventType.eventType)
    if (index === -1) {
      throw new Error(`EventType ${eventType.eventType} not found!`)
    }
    const saved = await putEventType(eventType, token)
    const newEventTypes = eventTypes.map<EventType>((j) => ({ ...j }))
    newEventTypes.splice(index, 1, saved)
    setEventTypes(newEventTypes)
  }
}
