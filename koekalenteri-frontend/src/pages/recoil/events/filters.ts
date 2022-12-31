import { EventEx } from 'koekalenteri-shared/model'

import { FilterProps } from './atoms'


export function withinDateFilters(event: EventEx, { start, end }: FilterProps) {
  if (start && (!event.endDate || event.endDate < start)) {
    return false
  }
  if (end && (!event.startDate || event.startDate > end)) {
    return false
  }
  return true
}

export function withinSwitchFilters(event: EventEx, { withOpenEntry, withClosingEntry, withUpcomingEntry, withFreePlaces }: FilterProps) {
  let result

  if (withOpenEntry) {
    result = event.isEntryOpen
    if (withClosingEntry) {
      result = result && event.isEntryClosing
    }
    if (withFreePlaces) {
      result = result && event.places > event.entries
    }
  }

  if (withUpcomingEntry) {
    result = result || event.isEntryUpcoming
  }

  return result !== false
}

export function withinArrayFilters(event: EventEx, { eventType, eventClass, judge, organizer }: FilterProps) {
  if (eventType.length && !eventType.includes(event.eventType)) {
    return false
  }
  if (eventClass.length && !eventClass.some(c => event.classes.map(cl => cl.class).includes(c))) {
    return false
  }
  if (judge.length && !judge.some(j => event.judges?.includes(j))) {
    return false
  }
  if (organizer.length && !organizer.includes(event.organizer?.id)) {
    return false
  }
  return true
}
