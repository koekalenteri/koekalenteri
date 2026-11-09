import type useAdminEventRegistrationInfo from '@/hooks/useAdminEventRegistrationsInfo'
import type { PublishBlocker } from '@/lib/publishing'
import type { ClassKey, ConfirmedEvent } from '@/types'
import {
  formatTypeOf,
  isStartListAvailable,
  isStartListAvailableForClass,
  isStartNumbersPublishedForClass,
} from '@/lib/event'
import { isEventClass } from '@/lib/eventClass'
import { getStartListBlocker, getStartNumbersBlocker, isStartListPublished } from '@/lib/publishing'

type RegistrationInfo = ReturnType<typeof useAdminEventRegistrationInfo>
type EventClass = ConfirmedEvent['classes'][number]
type ClassPredicate = (event: ConfirmedEvent, eventClass?: EventClass) => boolean

/**
 * Whether the numbers are out for every day of the class: a multi-day class publishes one draw at a
 * time (KOE-1304), and the class only counts as done once the last day is out.
 */
export const isStartNumbersPublished: ClassPredicate = (event, eventClass) =>
  eventClass
    ? isStartListAvailableForClass(event, eventClass) && isStartNumbersPublishedForClass(event, eventClass.class)
    : event.classes.length === 0 && isStartListAvailable(event) && isStartNumbersPublishedForClass(event)

/** The predicate over every class of the event, or over the event itself where it has none. */
export const isPublishedForEveryClass = (event: ConfirmedEvent, published: ClassPredicate) =>
  event.classes.length === 0 ? published(event) : event.classes.every((eventClass) => published(event, eventClass))

interface PublishingRowsProps {
  readonly event: ConfirmedEvent
  readonly eventWithCurrentAttachments: ConfirmedEvent
  readonly selectedByClass: RegistrationInfo['selectedByClass']
}

interface PublishingRow {
  readonly className: string
  /** The class entry the row stands for; a classless event has none. */
  readonly eventClass: EventClass | undefined
  /** What still stands before the start list; absent when it can be published (the rules in lib/publishing). */
  readonly startListBlocker: PublishBlocker | undefined
  /** What still stands before the start numbers; absent when they can be published. */
  readonly startNumbersBlocker: PublishBlocker | undefined
  /** The row names a class or the classless event itself, rather than a name nothing can be published for. */
  readonly publishable: boolean
  /** The class the publish request is for; undefined for the classless event. */
  readonly startListEventClass: ClassKey | undefined
  readonly startListPublished: boolean
}

const getPublishingRow = (
  { event, eventWithCurrentAttachments, selectedByClass }: PublishingRowsProps,
  className: string
): PublishingRow => {
  const selected = selectedByClass[className] ?? []
  const eventClass = event.classes.find((item) => item.class === className)
  // A classless trial's row is keyed by its format, as its dogs are (`getRegistrationClass`, KOE-1718).
  const classlessEventRow = event.classes.length === 0 && className === formatTypeOf(event)
  const startListEventClass = isEventClass(event, className) ? className : undefined
  const publishable = classlessEventRow || startListEventClass !== undefined

  return {
    className,
    eventClass,
    publishable,
    startListBlocker: getStartListBlocker(eventWithCurrentAttachments, startListEventClass, selected),
    startListEventClass,
    startListPublished: isStartListPublished(event, eventClass),
    startNumbersBlocker: getStartNumbersBlocker(eventWithCurrentAttachments, startListEventClass, selected),
  }
}

/** What the publishing sections know about each class row before drawing its buttons. */
export const getPublishingRows = (
  props: PublishingRowsProps,
  numbersByClass: RegistrationInfo['numbersByClass']
): PublishingRow[] => Object.keys(numbersByClass).map((className) => getPublishingRow(props, className))
