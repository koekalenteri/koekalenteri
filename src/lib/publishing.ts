import type {
  ClassOrNone,
  ConfirmedEvent,
  DogEvent,
  JsonConfirmedEvent,
  RegistrationClass,
  ResultsDayScope,
  ResultsPublishedState,
} from '../types'
import type { InvitationAttachmentRegistration } from './registration'
import {
  canPublishResults,
  canPublishStartList,
  getEventStateForClass,
  hasDayStarted,
  isDayEntry,
  isEntryEditingClosed,
  isStartListAvailable,
  isStartListAvailableForClass,
  isStartListPublishedForClass,
} from './event'
import { getInvitationRecipients, isRegistrationClass } from './registration'
import { isObject } from './utils'

/**
 * The order a trial is published in — start list, then its numbers, then the results riding on it —
 * as one set of rules. The panel greys its buttons with these and the server refuses a publish that
 * breaks them (KOE-1466), so the two cannot come to disagree.
 */

type PublishingEvent = ConfirmedEvent | JsonConfirmedEvent
type ClassEntry = PublishingEvent['classes'][number]
/** What reading the start list's state needs; an admin's unconfirmed `DogEvent` has it too. */
type StartListEvent = PublishingEvent | DogEvent

/** Why a publish is refused; absent when nothing stands in its way. */
export type PublishBlocker = 'participants' | 'state' | 'invitations' | 'startList'

/** The class's entry — its first day's, for a class running on several — or none for a classless event. */
export const classEntry = (
  event: { readonly classes: ReadonlyArray<Pick<ClassEntry, 'class' | 'state'>> },
  eventClass: RegistrationClass | undefined
): Pick<ClassEntry, 'class' | 'state'> | undefined =>
  eventClass ? event.classes.find((item) => item.class === eventClass) : undefined

/** Whether the start list of the class entry — or of a classless event, given none — is out. */
export const isStartListPublished = (event: StartListEvent, eventClass?: Pick<ClassEntry, 'class' | 'state'>) =>
  eventClass
    ? isStartListAvailableForClass(event, eventClass)
    : event.classes.length === 0 && isStartListAvailable(event)

/**
 * Whether the stored flag has the class's — or the classless event's — list published: what a save
 * compares to tell a publish from a flag left as it was. A stored flag is the secretary's decision even
 * while the state still keeps the list off the web, so a publish ahead of the state is still a publish
 * to judge. An absent flag is read as the public list reads it, published only where the workflow
 * carried the event to 'invited'; read as published everywhere, it hid the first publish of a trial
 * that never sent invitations (KOE-1465).
 */
export const isStartListFlagPublished = (event: StartListEvent, eventClass: RegistrationClass | undefined) =>
  event.startListPublished === undefined
    ? isStartListPublished(event, classEntry(event, eventClass))
    : isStartListPublishedForClass(event, eventClass ?? event.eventType)

/**
 * What still stands before the start list of the class, or of a classless event without one: the
 * participants picked, the trial carried to its invitations, and those sent — for as long as they can
 * still be sent. Past the trial's day, or once the class is judged, they no longer can, and waiting on
 * them would leave the list and its results unpublishable for good (KOE-1465).
 */
export const getStartListBlocker = (
  event: PublishingEvent,
  eventClass: RegistrationClass | undefined,
  participants: readonly InvitationAttachmentRegistration[]
): PublishBlocker | undefined => {
  const state = getEventStateForClass(event, eventClass)
  if (participants.length === 0) return 'participants'
  if (!canPublishStartList(state, event)) return 'state'
  if (getInvitationRecipients(event, [...participants]).length > 0 && !isEntryEditingClosed(event, state)) {
    return 'invitations'
  }
  return undefined
}

/** The numbers wait on everything the start list does, and on the list itself being out. */
export const getStartNumbersBlocker = (
  event: PublishingEvent,
  eventClass: RegistrationClass | undefined,
  participants: readonly InvitationAttachmentRegistration[]
): PublishBlocker | undefined => {
  const blocker = getStartListBlocker(event, eventClass, participants)
  if (blocker) return blocker
  return isStartListPublished(event, classEntry(event, eventClass)) ? undefined : 'startList'
}

/**
 * A result reaches the public only on the start list's rows, so it waits on the list; and there is
 * nothing to publish before the dogs have run. Each day is published on its own (KOE-1510), so a day
 * that has not begun has nothing to publish either, however far the trial is.
 */
export const getResultsBlocker = (
  event: PublishingEvent,
  eventClass: ClassOrNone,
  day?: string | Date
): PublishBlocker | undefined => {
  if (!isStartListPublished(event, classEntry(event, eventClass))) return 'startList'
  if (!canPublishResults(getEventStateForClass(event, eventClass), event)) return 'state'
  if (day && !hasDayStarted(day)) return 'state'
  return undefined
}

const isDayScope = (value: unknown): value is ResultsDayScope =>
  typeof value === 'boolean' || (Array.isArray(value) && value.every(isDayEntry))

/**
 * A value shaped like a stored results flag (KOE-1510): one day scope, or a map of them keyed by
 * class. Read where a written row comes back from the database, so nothing is taken on trust.
 */
export const isResultsPublishedState = (value: unknown): value is ResultsPublishedState =>
  isDayScope(value) ||
  (isObject(value) && Object.entries(value).every(([key, scope]) => isRegistrationClass(key) && isDayScope(scope)))
