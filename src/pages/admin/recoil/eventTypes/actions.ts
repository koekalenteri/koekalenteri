import type { EventType, EventTypeData } from '../../../../types'

import i18next from 'i18next'
import { useRecoilState, useRecoilValue } from 'recoil'

import { getEventTypes, putEventType } from '../../../../api/eventType'
import { idTokenAtom } from '../../../recoil/user'

import { adminEventTypesAtom } from './atoms'

const sortEventTypes = (eventTypes: EventType[]) =>
  [...eventTypes].sort((a, b) => a.eventType.localeCompare(b.eventType, i18next.language))

export const useAdminEventTypeActions = () => {
  const [eventTypes, setEventTypes] = useRecoilState(adminEventTypesAtom)
  const token = useRecoilValue(idTokenAtom)

  return {
    refresh,
    save,
  }

  async function refresh() {
    if (!token) throw new Error('missing token')
    const eventTypes = await getEventTypes(token, true)
    setEventTypes(sortEventTypes(eventTypes))
  }

  async function save(eventType: EventTypeData) {
    const index = eventTypes.findIndex((j) => j.eventType === eventType.eventType)
    const insert = index === -1
    const saved = await putEventType(eventType, token)
    const newEventTypes = eventTypes.map<EventType>((j) => ({ ...j }))
    newEventTypes.splice(insert ? newEventTypes.length : index, insert ? 0 : 1, saved)
    setEventTypes(sortEventTypes(newEventTypes))
  }
}
