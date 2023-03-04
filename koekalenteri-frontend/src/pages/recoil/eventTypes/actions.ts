import { useAuthenticator } from '@aws-amplify/ui-react'
import i18next from 'i18next'
import { EventType } from 'koekalenteri-shared/model'
import { useRecoilState } from 'recoil'

import { getEventTypes, putEventType } from '../../../api/eventType'

import { eventTypesAtom } from './atoms'

export const useEventTypeActions = () => {
  const { user } = useAuthenticator((context) => [context.user])
  const [eventTypes, setEventTypes] = useRecoilState(eventTypesAtom)

  return {
    refresh,
    save,
  }

  function refresh() {
    getEventTypes(true).then((eventTypes) => {
      const sortedEventTypes = [...eventTypes].sort((a, b) => a.eventType.localeCompare(b.eventType, i18next.language))
      setEventTypes(sortedEventTypes)
    })
  }

  async function save(eventType: EventType) {
    const index = eventTypes.findIndex((j) => j.eventType === eventType.eventType)
    if (index === -1) {
      throw new Error(`EventType ${eventType.eventType} not found!`)
    }
    const saved = await putEventType(eventType, user.getSignInUserSession()?.getIdToken().getJwtToken())
    const newEventTypes = eventTypes.map<EventType>((j) => ({ ...j }))
    newEventTypes.splice(index, 1, saved)
    setEventTypes(newEventTypes)
  }
}
