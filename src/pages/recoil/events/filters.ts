import type { TFunction } from 'i18next'
import type { PublicDogEvent } from '../../../types'
import type { FilterProps } from './atoms'

import { endOfDay, format, formatISO, startOfDay } from 'date-fns'

import { isEntryClosing, isEntryOpen, isEntryUpcoming } from '../../../lib/utils'
import { isRegistrationClass } from '../../admin/EventViewPage'

export const readDate = (date: string | null) => (date ? new Date(date) : null)
export const writeDate = (date: Date | null) => (date ? formatISO(date, { representation: 'date' }) : '')

export function withinDateFilters(
  event: Partial<Pick<PublicDogEvent, 'startDate' | 'endDate'>>,
  { start, end }: Pick<FilterProps, 'start' | 'end'>
) {
  if (start && (!event.endDate || endOfDay(event.endDate) < endOfDay(start))) {
    return false
  }
  if (end && (!event.startDate || startOfDay(event.startDate) > startOfDay(end))) {
    return false
  }
  return true
}

export function withinSwitchFilters(
  event: PublicDogEvent,
  { withOpenEntry, withClosingEntry, withUpcomingEntry, withFreePlaces }: FilterProps
): boolean {
  let result: boolean | undefined

  if (withOpenEntry) {
    result = isEntryOpen(event)
    if (withClosingEntry) {
      result = result && isEntryClosing(event)
    }
    if (withFreePlaces) {
      result = result && event.places > (event.entries ?? 0)
    }
  }

  if (withUpcomingEntry) {
    result = result || isEntryUpcoming(event)
  }

  return result !== false
}

export function withinEventTypeFilter(event: PublicDogEvent, { eventType, eventClass, judge, organizer }: FilterProps) {
  if (eventType.length && !eventType.includes(event.eventType)) {
    return false
  }
  return true
}

export function withinEventTypeClassFilter(event: PublicDogEvent, { eventClass }: FilterProps) {
  if (eventClass.length && !eventClass.some((c) => event.classes.map((cl) => cl.class).includes(c))) {
    return false
  }
  return true
}

export function withinJudgeFilter(event: PublicDogEvent, { judge }: FilterProps) {
  if (judge.length && !judge.some((name) => event.judges?.find((ej) => ej.name === name))) {
    return false
  }
  return true
}

export function withinOrganizerFilter(event: PublicDogEvent, { organizer }: FilterProps) {
  if (organizer.length && !organizer.includes(event.organizer?.id)) {
    return false
  }
  return true
}

export function serializeFilter(eventFilter: FilterProps): string {
  const params = new URLSearchParams()
  const bits = []
  if (eventFilter.withClosingEntry) {
    bits.push('c')
  }
  if (eventFilter.withFreePlaces) {
    bits.push('f')
  }
  if (eventFilter.withOpenEntry) {
    bits.push('o')
  }
  if (eventFilter.withUpcomingEntry) {
    bits.push('u')
  }
  if (eventFilter.start) {
    params.append('s', writeDate(eventFilter.start))
  }
  if (eventFilter.end) {
    params.append('e', writeDate(eventFilter.end))
  }
  eventFilter.eventClass.forEach((v) => params.append('c', v))
  eventFilter.eventType.forEach((v) => params.append('t', v))
  eventFilter.judge.forEach((v) => params.append('j', v.toString()))
  eventFilter.organizer.forEach((v) => params.append('o', v.toString()))
  bits.forEach((v) => params.append('b', v))

  return params.toString()
}

export function deserializeFilter(input: string) {
  const searchParams = new URLSearchParams(input)
  const bits = searchParams.getAll('b')
  const result: FilterProps = {
    end: readDate(searchParams.get('e')),
    eventClass: searchParams.getAll('c').filter(isRegistrationClass),
    eventType: searchParams.getAll('t'),
    judge: searchParams.getAll('j'),
    organizer: searchParams.getAll('o'),
    start: readDate(searchParams.get('s')),
    withClosingEntry: bits.includes('c'),
    withFreePlaces: bits.includes('f'),
    withOpenEntry: bits.includes('o'),
    withUpcomingEntry: bits.includes('u'),
  }

  return result
}

export function filterString(filter: FilterProps, t: TFunction): string {
  const filters: string[] = []
  if (filter.start) {
    if (filter.end) {
      filters.push(`${t('daterangeBoth')}: ${format(filter.start, 'dd.MM.yyyy')} - ${format(filter.end, 'dd.MM.yyyy')}`)
    } else {
      filters.push(`${t('daterangeStart')}: ${format(filter.start, 'dd.MM.yyyy')}`)
    }
  } else if (filter.end) {
    filters.push(`${t('daterangeEnd')}: ${format(filter.end, 'dd.MM.yyyy')}`)
  }
  if (filter.eventType?.length) {
    filters.push(t('eventTypes') + ': ' + filter.eventType.join(', '))
  }
  if (filter.eventClass?.length) {
    filters.push(t('event.classes') + ': ' + filter.eventClass.join(', '))
  }
  if (filter.organizer?.length) {
    filters.push('Järjestäjät: ' + filter.organizer.length)
  }
  if (filter.judge?.length) {
    filters.push('Tuomarit: ' + filter.judge.length)
  }
  if (filter.withOpenEntry) {
    filters.push(t('entryOpen'))
  }
  if (filter.withUpcomingEntry) {
    filters.push(t('entryUpcoming'))
  }

  return filters.join(' | ')
}
