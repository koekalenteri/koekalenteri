import { ConfirmedEventEx } from "koekalenteri-shared/model";
import { selectorFamily } from "recoil";

import { getEvent } from "../../../../api/event";
import { unique, uniqueDate } from "../../../../utils";

export interface DecoratedEvent extends ConfirmedEventEx {
  uniqueClasses: string[]
  uniqueClassDates: (eventClass: string) => Date[]
}

export const eventSelector = selectorFamily<DecoratedEvent, string>({
  key: 'Event',
  get: (eventId) => async () => {
    const event = await getEvent(eventId) as ConfirmedEventEx
    return event && {
      ...event,
      uniqueClasses: unique(event.classes.map(c => c.class)),
      uniqueClassDates: (eventClass: string) => uniqueDate(
        event.classes
          .filter(c => c.class === eventClass)
          .map(c => c.date || event.startDate)
      )
    }
  },
});
