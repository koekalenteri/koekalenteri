import type { TFunction } from 'i18next'
import type { PublicDogEvent } from '@/types'
import type { FilterProps } from './types'
import { formatDate, formatDateSpan } from '@/i18n/dates'
import { dayOf, isDayKey, TIME_ZONE } from '@/lib/day'
import { hasAvailableResults, isEntryClosing, isEntryOpen, isEntryUpcoming, storedDayKey } from '@/lib/event'
import { isRegistrationClass } from '@/lib/registration'

/** A day key from the URL as it is; anything else, including nothing, is no day. */
const readDay = (day: string | null) => (isDayKey(day) ? day : null)

export function withinDateFilters(
  event: Partial<Pick<PublicDogEvent, 'startDate' | 'endDate'>>,
  { start, end }: Pick<FilterProps, 'start' | 'end'>
) {
  // A stored date without a calendar day is not in any range: the list skips the event rather than fail.
  if (start) {
    const endDay = storedDayKey(event.endDate)
    if (!endDay || endDay < start) return false
  }
  if (end) {
    const startDay = storedDayKey(event.startDate)
    if (!startDay || startDay > end) return false
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

/**
 * The results are read through the start list page, so an event is listed only where some class has
 * both its list and its results public (KOE-1504). Whether the row's link says "results" or "start
 * list" is a separate question, answered by whether every class's results are out.
 */
export function withinResultsFilter(event: PublicDogEvent, { withResults }: FilterProps) {
  return !withResults || hasAvailableResults(event)
}

export function withinEventTypeFilter(event: PublicDogEvent, { eventType }: FilterProps) {
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
  if (eventFilter.withResults) {
    bits.push('r')
  }
  params.append('s', eventFilter.start ?? '')
  if (eventFilter.end) {
    params.append('e', eventFilter.end)
  }
  eventFilter.eventClass.forEach((v) => {
    params.append('c', v)
  })
  eventFilter.eventType.forEach((v) => {
    params.append('t', v)
  })
  eventFilter.judge.forEach((v) => {
    params.append('j', v.toString())
  })
  eventFilter.organizer.forEach((v) => {
    params.append('o', v.toString())
  })
  bits.forEach((v) => {
    params.append('b', v)
  })

  return params.toString()
}

export function deserializeFilter(input: string) {
  const searchParams = new URLSearchParams(input)
  const bits = searchParams.getAll('b')
  // Without `s` the list starts today; an empty `s` is a list with no start.
  const start = searchParams.has('s') ? readDay(searchParams.get('s')) : dayOf(new Date(), TIME_ZONE)
  const result: FilterProps = {
    end: readDay(searchParams.get('e')),
    eventClass: searchParams.getAll('c').filter(isRegistrationClass),
    eventType: searchParams.getAll('t'),
    judge: searchParams.getAll('j'),
    organizer: searchParams.getAll('o'),
    start,
    withClosingEntry: bits.includes('c'),
    withFreePlaces: bits.includes('f'),
    withOpenEntry: bits.includes('o'),
    withResults: bits.includes('r'),
    withUpcomingEntry: bits.includes('u'),
  }

  return result
}

export function filterStrings(filter: FilterProps, t: TFunction): string[] {
  const filters: string[] = []
  if (filter.start) {
    if (filter.end) {
      filters.push(`${t('daterangeBoth')}: ${formatDateSpan(filter.start, undefined, { end: filter.end })}`)
    } else {
      filters.push(`${t('daterangeStart')}: ${formatDate(filter.start, 'dd.MM.yyyy')}`)
    }
  } else if (filter.end) {
    filters.push(`${t('daterangeEnd')}: ${formatDate(filter.end, 'dd.MM.yyyy')}`)
  }
  if (filter.eventType?.length) {
    filters.push(`${t('eventTypes')}: ${filter.eventType.join(', ')}`)
  }
  if (filter.eventClass?.length) {
    filters.push(`${t('event.classes')}: ${filter.eventClass.join(', ')}`)
  }
  if (filter.organizer?.length) {
    filters.push(`Järjestäjät: ${filter.organizer.length}`)
  }
  if (filter.judge?.length) {
    filters.push(`Tuomarit: ${filter.judge.length}`)
  }
  if (filter.withOpenEntry) {
    filters.push(t('entryOpen'))
  }
  if (filter.withUpcomingEntry) {
    filters.push(t('entryUpcoming'))
  }
  if (filter.withResults) {
    filters.push(t('filter.resultsPublished'))
  }

  return filters
}
