import type useAdminEventRegistrationInfo from '../../../../hooks/useAdminEventRegistrationsInfo'
import type { ConfirmedEvent, RegistrationClass } from '../../../../types'
import {
  canPublishStartList,
  isStartListAvailable,
  isStartListAvailableForClass,
  isStartNumbersPublishedForClass,
} from '../../../../lib/event'
import { getInvitationRecipients, isRegistrationClass } from '../../../../lib/registration'

type RegistrationInfo = ReturnType<typeof useAdminEventRegistrationInfo>
type EventClass = ConfirmedEvent['classes'][number]
type ClassPredicate = (event: ConfirmedEvent, eventClass?: EventClass) => boolean

/** Whether the start list of the class — or of a classless event — is out. */
export const isStartListPublished: ClassPredicate = (event, eventClass) =>
  eventClass
    ? isStartListAvailableForClass(event, eventClass)
    : event.classes.length === 0 && isStartListAvailable(event)

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

interface PublishingRowProps {
  readonly event: ConfirmedEvent
  readonly eventWithCurrentAttachments: ConfirmedEvent
  readonly selectedByClass: RegistrationInfo['selectedByClass']
  readonly stateByClass: RegistrationInfo['stateByClass']
}

interface PublishingRow {
  /** The class entry the row stands for; a classless event has none. */
  readonly eventClass: EventClass | undefined
  /** Every invited participant has had the invitation, which is what the start list waits on. */
  readonly invitationsSent: boolean
  /** The row names something the buttons can act on and the class has reached the publishing gate. */
  readonly manageable: boolean
  readonly participantsPicked: boolean
  /** The row names a class or the classless event itself, rather than a name nothing can be published for. */
  readonly publishable: boolean
  /** The class the publish request is for; undefined for the classless event. */
  readonly startListEventClass: RegistrationClass | undefined
  readonly startListPublished: boolean
}

/** What the publishing sections know about one class row before drawing its buttons. */
export const getPublishingRow = (
  { event, eventWithCurrentAttachments, selectedByClass, stateByClass }: PublishingRowProps,
  className: string
): PublishingRow => {
  const selected = selectedByClass[className] ?? []
  const invitationsSent =
    selected.length > 0 && getInvitationRecipients(eventWithCurrentAttachments, selected).length === 0
  const classState = stateByClass[className] ?? event.state
  const eventClass = event.classes.find((item) => item.class === className)
  const classlessEventRow = event.classes.length === 0 && className === event.eventType
  const startListEventClass = isRegistrationClass(className) ? className : undefined
  const publishable = classlessEventRow || startListEventClass !== undefined

  return {
    eventClass,
    invitationsSent,
    manageable: publishable && canPublishStartList(classState, event),
    participantsPicked: selected.length > 0,
    publishable,
    startListEventClass,
    startListPublished: isStartListPublished(event, eventClass),
  }
}
