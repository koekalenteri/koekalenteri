import { EventEx } from "koekalenteri-shared/model"
import { AtomEffect } from "recoil"

import { getEvents } from "../../../../api/event"
import { unique, uniqueDate } from "../../../../utils"


export interface DecoratedEvent extends EventEx {
  uniqueClasses: string[];
  uniqueClassDates: Record<string, Date[]>;
}

export function decorateEvent(event: EventEx): DecoratedEvent {
  const uniqueClasses = unique(event.classes.map(c => c.class))
  const uniqueClassDates = uniqueClasses
    .reduce((acc, cur) => (
      {
        ...acc,
        [cur]: uniqueDate(event.classes
          .filter(c => c.class === cur)
          .map(c => c.date || event.startDate || new Date())),
      }),
    {} as Record<string, Date[]>)

  return {
    ...event,
    uniqueClasses,
    uniqueClassDates,
  }
}
export const remoteAdminEventsEffect: AtomEffect<DecoratedEvent[]> = ({ setSelf, onSet }) => {
  getEvents().then(events => setSelf(events.map(decorateEvent)))

  onSet((newValue, oldValue, isReset) => {
    console.log('put event?', newValue, oldValue, isReset)
  })
}
