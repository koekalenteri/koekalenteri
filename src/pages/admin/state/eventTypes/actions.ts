import type { EventType, EventTypeData } from '../../../../types'
import { useAtom, useAtomValue } from 'jotai'
import { getEventTypes, putEventType } from '../../../../api/eventType'
import { compareByLocalizedString } from '../../../../lib/client/sort'
import { validIdTokenAtom } from '../../../state/user'
import { adminEventTypesAtom } from './atoms'

const sortEventTypes = (eventTypes: EventType[]) => [...eventTypes].sort(compareByLocalizedString('eventType'))

export const useAdminEventTypeActions = () => {
  const [eventTypes, setEventTypes] = useAtom(adminEventTypesAtom)
  const token = useAtomValue(validIdTokenAtom)

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
