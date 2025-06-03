import type { TFunction } from 'i18next'
import type { PublicDogEvent } from '../../../types'
import type { FilterProps } from './types'

import { format } from 'date-fns'

import { formatDateSpan, zonedDateString, zonedEndOfDay, zonedParseDate, zonedStartOfDay } from '../../../i18n/dates'
import { isRegistrationClass } from '../../../lib/registration'
import { isEntryClosing, isEntryOpen, isEntryUpcoming } from '../../../lib/utils'

export const readDate = (date: string | null) => (date ? zonedParseDate(date) : null)
export const writeDate = (date: Date | null) => (date ? zonedDateString(date) : '')

export function withinDateFilters(
  event: Partial<Pick<PublicDogEvent, 'startDate' | 'endDate'>>,
  { start, end }: Pick<FilterProps, 'start' | 'end'>
) {
  if (start && (!event.endDate || zonedEndOfDay(event.endDate) < zonedEndOfDay(start))) {
    return false
  }
  if (end && (!event.startDate || zonedStartOfDay(event.startDate) > zonedStartOfDay(end))) {
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
  params.append('s', eventFilter.start ? writeDate(eventFilter.start) : '')
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
  const end = searchParams.get('e')
  const start = searchParams.has('s') ? searchParams.get('s') : writeDate(new Date())
  const result: FilterProps = {
    end: end ? zonedEndOfDay(end) : null,
    eventClass: searchParams.getAll('c').filter(isRegistrationClass),
    eventType: searchParams.getAll('t'),
    judge: searchParams.getAll('j'),
    organizer: searchParams.getAll('o'),
    start: start ? zonedStartOfDay(start) : null,
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
      filters.push(`${t('daterangeBoth')}: ${formatDateSpan(filter.start, undefined, { end: filter.end })}`)
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
