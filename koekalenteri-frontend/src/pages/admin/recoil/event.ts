import { useTranslation } from "react-i18next"
import { useAuthenticator } from "@aws-amplify/ui-react"
import { startOfToday } from "date-fns"
import i18next from "i18next"
import { EventEx } from "koekalenteri-shared/model"
import cloneDeep from "lodash.clonedeep"
import { useSnackbar } from "notistack"
import { atom, DefaultValue, selector, selectorFamily, useRecoilState, useSetRecoilState } from "recoil"

import { getEvent, getEvents } from "../../../api/event"
import { unique, uniqueDate } from "../../../utils"
import { logEffect, storageEffect } from "../../recoil/effects"

export interface DecoratedEvent extends EventEx {
  uniqueClasses: string[]
  uniqueClassDates: Record<string, Date[]>
}

export const adminEventsAtom = atom<DecoratedEvent[]>({
  key: 'adminEvents',
  default: [],
  effects: [
    logEffect,
    storageEffect,
    ({setSelf, onSet}) => {
      getEvents().then(events => setSelf(events.map(decorateEvent)))

      onSet((newValue, oldValue, isReset) => {
        console.log('put event?', newValue, oldValue, isReset)
      })
    },
  ],
})

export const adminShowPastEventsAtom = atom<boolean>({
  key: 'adminShowPastEvents',
  default: false,
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const adminEventFilterTextAtom = atom<string>({
  key: 'adminEventFilterText',
  default: '',
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const filteredAdminEventsQuery = selector({
  key: 'filteredAdminEvents',
  get: ({get}) => {
    const events = get(adminEventsAtom)
    const filter = get(adminEventFilterTextAtom).toLocaleLowerCase(i18next.language)
    const showPast = get(adminShowPastEventsAtom)

    return events.filter(event => {
      return !event.deletedAt
        && (showPast || !event.startDate || event.startDate < startOfToday())
        && (!filter || ([event.location, event.official.name, event.secretary.name].join(' ').toLocaleLowerCase(i18next.language).includes(filter)))
    })
  },
})

export const adminEventIdAtom = atom<string | undefined>({
  key: 'adminEventId',
  default: undefined,
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const currentAdminEventQuery = selector({
  key: 'currentAdminEvent',
  get: ({ get }) => {
    const eventId = get(adminEventIdAtom)
    return eventId ? get(adminEventSelector(eventId)) : undefined
  },
  set: ({ set }, newValue) => {
    if (!newValue || newValue instanceof DefaultValue) {
      return
    }
    set(adminEventSelector(newValue.id), newValue)
  },
})

function decorateEvent(event: EventEx): DecoratedEvent {
  const uniqueClasses = unique(event.classes.map(c => c.class))
  const uniqueClassDates = uniqueClasses
    .reduce((acc, cur) => (
      {
        ...acc,
        [cur]: uniqueDate(event.classes
          .filter(c => c.class===cur)
          .map(c => c.date || event.startDate || new Date())),
      }),
    {} as Record<string, Date[]>)

  return {
    ...event,
    uniqueClasses,
    uniqueClassDates,
  }
}

export const adminEventByIdAtom = selectorFamily<DecoratedEvent | undefined, string>({
  key: 'adminEvents/eventId',
  get: (eventId) => async ({ get }) => {
    let event = get(adminEventsAtom).find(event => event.id === eventId)
    if (!event) {
      const fetched = await getEvent(eventId)
      if (fetched) {
        event = decorateEvent(fetched)
      }
    }
    return event
  },
  set: (eventId) => ({ set }, newValue) => {
    if (!newValue || newValue instanceof DefaultValue) {
      return
    }
    set(adminEventsAtom, oldEvents => {
      const index = oldEvents.findIndex(item => item.id === eventId)
      const newEvents = oldEvents.map(event => ({...event}))
      newEvents.splice(index, 1, newValue)
      return newEvents
    })
  },
})

export const adminEventSelector = selectorFamily<DecoratedEvent | undefined, string>({
  key: 'adminEvent',
  get: (eventId) => ({get}) => get(adminEventByIdAtom(eventId)),
  set: (eventId) => ({set}, newValue) => set(adminEventByIdAtom(eventId), newValue),
})

export const eventClassAtom = atom<string | undefined>({
  key: 'eventClass',
  default: selector({
    key: 'eventClass/default',
    get: ({ get }) => get(currentAdminEventQuery)?.uniqueClasses?.[0],
  }),
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const useAdminEventActions = () => {
  const { user } = useAuthenticator(context => [context.user])
  const setAdminEventId = useSetRecoilState(adminEventIdAtom)
  const [currentAdminEvent, setCurrentAdminEvent] = useRecoilState(currentAdminEventQuery)
  const { enqueueSnackbar } = useSnackbar()
  const { t } = useTranslation()

  return {
    copyCurrent,
    deleteCurrent,
  }

  function copyCurrent() {
    if (!currentAdminEvent) {
      return
    }
    const copy = cloneDeep(currentAdminEvent)
    copy.id = 'draft'
    copy.state = 'draft'
    delete copy.kcId

    setCurrentAdminEvent(copy)
    setAdminEventId(copy.id)
    return copy.id
  }

  function deleteCurrent() {
    if (!currentAdminEvent) {
      return
    }
    setCurrentAdminEvent({
      ...currentAdminEvent,
      deletedAt: new Date(),
      deletedBy: user.attributes?.name || user.attributes?.email,
    })
    enqueueSnackbar(t('deleteEventComplete'), { variant: 'info' })
  }

}
