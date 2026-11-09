import type { TFunction } from 'i18next'
import type { DayKey, DogEventCost, EventState, JsonDogEvent, JsonRegistration } from '../types'
import type { EventClassStatsRow } from '../types/Stats'
import { getCostValue } from './cost'
import { classOrder, compareRegistrationClasses, eventDates, placesForClass, uniqueClasses } from './event'
import { PRIORITY, priorityValuesToPriority } from './priority'
import { hasPriority, isFinishedEntry, isStarter } from './registration'
import { unique } from './utils'

/** A draft or tentative trial is saved without a price; only a confirmed one must have it (KOE-1713). */
type EventClassStatsEvent = Pick<
  JsonDogEvent,
  | 'classes'
  | 'endDate'
  | 'entryEndDate'
  | 'entryStartDate'
  | 'eventType'
  | 'location'
  | 'ownClasses'
  | 'places'
  | 'placesPerDay'
  | 'priority'
  | 'qualificationStartDate'
  | 'startDate'
  | 'state'
> &
  Partial<Pick<JsonDogEvent, 'cost' | 'costMember'>> & { organizer: Pick<JsonDogEvent['organizer'], 'id'> }

type EventClassStatsRegistration = Pick<
  JsonRegistration,
  'cancelled' | 'class' | 'group' | 'messagesSent' | 'paidAmount' | 'refundAmount' | 'reserveNotified' | 'state'
> &
  Parameters<typeof hasPriority>[1]

/** The trials the export leaves out: never published, called off, or deleted. */
const EXCLUDED_STATES = new Set<EventState>(['cancelled', 'draft'])

export const isEventInClassStats = (event: Pick<JsonDogEvent, 'deletedAt' | 'state'>): boolean =>
  !event.deletedAt && !EXCLUDED_STATES.has(event.state)

/**
 * Picked from the reserve list: it was on the list when the reserve notice went out
 * (`reserveNotified`, never cleared) and now starts, or got the 'picked' message after, which still
 * tells it was picked when it cancelled later. `messagesSent` is written from v1.6.1 (June 2025), so
 * a dog picked before that and cancelled after is not counted; neither is one from a class whose
 * reserve list was never notified.
 */
const isPickedFromReserve = (registration: EventClassStatsRegistration): boolean =>
  Boolean(registration.reserveNotified) && (isStarter(registration) || Boolean(registration.messagesSent?.picked))

type ClassFigures = Pick<
  EventClassStatsRow,
  'cancelled' | 'entries' | 'paidAmount' | 'pickedFromReserve' | 'priorityEntries' | 'refundedAmount'
>

const emptyFigures = (): ClassFigures => ({
  cancelled: 0,
  entries: 0,
  paidAmount: 0,
  pickedFromReserve: 0,
  priorityEntries: 0,
  refundedAmount: 0,
})

const addRegistration = (
  figures: ClassFigures,
  event: EventClassStatsEvent,
  registration: EventClassStatsRegistration
): void => {
  figures.entries += 1
  if (registration.cancelled) figures.cancelled += 1
  if (hasPriority(event, registration)) figures.priorityEntries += 1
  if (isPickedFromReserve(registration)) figures.pickedFromReserve += 1
  figures.paidAmount += registration.paidAmount ?? 0
  figures.refundedAmount += registration.refundAmount ?? 0
}

/** The days a class runs on; a classless trial's are the trial's own. */
const classDays = (event: EventClassStatsEvent, eventClass: string): DayKey[] => {
  if (eventClass === '') return eventDates(event)
  // A trial whose classes are not a list has none, and reaches here only as '' (see uniqueClasses).
  const days = event.classes.filter((item) => item.class === eventClass).map((item) => item.date)
  return unique(days).sort((a, b) => a.localeCompare(b))
}

/** The normal price, or undefined for a trial without one: an empty cell, so it never looks free. */
const optionalCostValue = (cost: DogEventCost | number | undefined): number | undefined =>
  cost === undefined ? undefined : getCostValue(cost, 'normal')

/**
 * The trial's classes as rows: each class it runs, then each class only its entries name (one it no
 * longer runs). Only finished entries count; one left in the payment step is no entry. A
 * registration's class is the key, '' for a classless trial, so nothing about a person is kept.
 */
export const buildEventClassStats = (
  event: EventClassStatsEvent,
  registrations: EventClassStatsRegistration[]
): EventClassStatsRow[] => {
  const classes: string[] = uniqueClasses(event)
  // A classless trial is one row, keyed '' as its entries are.
  const runClasses = classes.length > 0 ? classes : ['']
  const figuresByClass = new Map<string, ClassFigures>(runClasses.map((eventClass) => [eventClass, emptyFigures()]))
  for (const registration of registrations) {
    if (!isFinishedEntry(registration)) continue
    const key = registration.class ?? ''
    const figures = figuresByClass.get(key) ?? emptyFigures()
    addRegistration(figures, event, registration)
    figuresByClass.set(key, figures)
  }

  const eventFields = {
    cost: optionalCostValue(event.cost),
    costMember: optionalCostValue(event.costMember),
    endDate: event.endDate,
    entryEndDate: event.entryEndDate,
    entryStartDate: event.entryStartDate,
    eventType: event.eventType,
    location: event.location,
    organizerId: event.organizer.id,
    priority: event.priority ?? [],
    startDate: event.startDate,
    state: event.state,
  }
  const toRow = ([eventClass, figures]: [string, ClassFigures], runs: boolean): EventClassStatsRow => ({
    ...eventFields,
    class: eventClass,
    days: runs ? classDays(event, eventClass) : [],
    places: runs ? placesForClass(event, eventClass) : 0,
    ...figures,
  })
  const entries = [...figuresByClass]
  // The classes the trial runs were put in first, in their order; the others follow, sorted.
  const run = entries.filter(([eventClass]) => runClasses.includes(eventClass))
  const notRun = entries
    .filter(([eventClass]) => !runClasses.includes(eventClass))
    .sort(([a], [b]) => classOrder(event)(a, b))

  return [...run.map((entry) => toRow(entry, true)), ...notRun.map((entry) => toRow(entry, false))]
}

const compareRows = (a: EventClassStatsRow, b: EventClassStatsRow): number =>
  a.startDate.localeCompare(b.startDate) ||
  a.organizerId.localeCompare(b.organizerId) ||
  a.eventType.localeCompare(b.eventType) ||
  compareRegistrationClasses(a.class, b.class)

/** The export's sheet: a header row, then the rows by start day, organizer, event type and class. */
export const eventClassStatsSpreadsheetRows = (
  rows: EventClassStatsRow[],
  t: TFunction<['translation', 'breed']>,
  organizerName: (organizerId: string) => string
): (string | number | undefined)[][] => [
  [
    t('organization'),
    t('event.location'),
    t('event.startDate'),
    t('event.endDate'),
    t('stats.admin.eventType'),
    t('event.state'),
    t('event.entryStartDate'),
    t('event.entryEndDate'),
    t('event.priority'),
    t('stats.admin.eventClassStatsCost'),
    t('stats.admin.eventClassStatsCostMember'),
    t('stats.admin.class'),
    t('stats.admin.eventClassStatsDays'),
    t('stats.admin.eventClassStatsPlaces'),
    t('stats.admin.eventClassStatsEntries'),
    t('stats.admin.eventClassStatsCancelled'),
    t('stats.admin.eventClassStatsPriority'),
    t('stats.admin.eventClassStatsPickedFromReserve'),
    t('stats.admin.eventClassStatsPaid'),
    t('stats.admin.eventClassStatsRefunded'),
  ],
  ...[...rows].sort(compareRows).map((row) => [
    organizerName(row.organizerId),
    row.location,
    row.startDate,
    row.endDate,
    row.eventType,
    t(`event.states.${row.state}`),
    row.entryStartDate,
    row.entryEndDate,
    priorityValuesToPriority(row.priority, PRIORITY)
      .map((priority) => t(priority.name))
      .join(', '),
    row.cost,
    row.costMember,
    row.class,
    row.days.join(', '),
    row.places,
    row.entries,
    row.cancelled,
    row.priorityEntries,
    row.pickedFromReserve,
    row.paidAmount,
    row.refundedAmount,
  ]),
]
