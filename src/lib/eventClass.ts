import type { ClassKey, EventClass, JsonDogEvent, RegistrationClass } from '../types'
import type { ClassOrderOwner } from './event'
import type { SortableRegistration } from './registration'
import { classOrder, isOfficialEventType, OFFICIAL_EVENT_TYPES, ownClassCodes } from './event'
import { isRegistrationClass, registrationSort } from './registration'

/**
 * An event's classes as the class rules read them (KOE-674): its type, the own classes an unofficial
 * event may run, and the class days, of which only the class is read.
 */
type ClassOwner = Pick<JsonDogEvent, 'eventType'> & Partial<Pick<JsonDogEvent, 'classes' | 'ownClasses'>>

/**
 * Why an event's own classes cannot be stored (KOE-674). `code` is the own class's code, or for
 * `notOwnClass` the class of a class day.
 */
type OwnClassError =
  | { kind: 'officialType' }
  | {
      kind: 'badCode' | 'codeTwice' | 'typeName' | 'unnamed' | 'noClassDay' | 'notOwnClass' | 'registered'
      code: string
    }

/**
 * An own class's code: a letter, then letters and digits, ten at most. Upper case A to Z only, since
 * the code goes into links and result codes as it is.
 */
const OWN_CLASS_CODE = /^[A-Z][A-Z0-9]{0,9}$/

/** What is wrong with the own classes themselves: their codes, their names and a day for each. */
const ownClassListErrors = (event: ClassOwner): OwnClassError[] => {
  const typeNames = new Set([event.eventType, ...OFFICIAL_EVENT_TYPES].map((name) => name.toUpperCase()))
  const dayClasses = new Set(event.classes?.map((eventClass) => eventClass.class))
  const seen = new Set<string>()
  const errors: OwnClassError[] = []

  for (const { code, name } of event.ownClasses ?? []) {
    if (!OWN_CLASS_CODE.test(code)) errors.push({ code, kind: 'badCode' })
    else if (typeNames.has(code.toUpperCase())) errors.push({ code, kind: 'typeName' })
    if (seen.has(code)) errors.push({ code, kind: 'codeTwice' })
    seen.add(code)
    if (!name.fi?.trim()) errors.push({ code, kind: 'unnamed' })
    if (!dayClasses.has(code)) errors.push({ code, kind: 'noClassDay' })
  }
  return errors
}

/** The keys among `keys` that are not a class of the event (`isEventClass`); a missing key is none. */
const outsideClasses = (event: Partial<ClassOwner>, keys: Iterable<string | null | undefined>): string[] =>
  [...new Set(keys)].filter((key): key is string => !!key && !isEventClass(event, key))

/**
 * Every reason the event save refuses its classes (KOE-674), read on the event as it would be saved:
 * - an official type runs its official classes, never its own (`isOfficialEventType`);
 * - a code is upper case letters and digits from a letter, ten at most, and the event's classes have
 *   it once;
 * - a code is not the event's own type or an official type, which a classless trial keys its classes
 *   by; the official classes' names are free, as the Hankinome runs ALO, AVO, VOI and VET of its own;
 * - every own class has a Finnish name and a class day;
 * - every class day is of a class of the event: an own class, or without own classes ALO, AVO or VOI;
 * - an entry's class (`registeredClasses`) stays a class of the event, so a code an entry holds is
 *   not changed or removed, nor the own classes taken away from under it.
 * A class day still without its class, as a form half filled leaves it, is none of these.
 */
export const ownClassErrors = (
  event: ClassOwner,
  registeredClasses: readonly (ClassKey | null | undefined)[] = []
): OwnClassError[] => {
  if (event.ownClasses?.length && isOfficialEventType(event.eventType)) return [{ kind: 'officialType' }]

  const dayClasses = event.classes?.map((eventClass) => eventClass.class) ?? []
  return [
    ...ownClassListErrors(event),
    ...outsideClasses(event, dayClasses).map((code): OwnClassError => ({ code, kind: 'notOwnClass' })),
    ...outsideClasses(event, registeredClasses).map((code): OwnClassError => ({ code, kind: 'registered' })),
  ]
}

/**
 * The classes entries were made in, as the event form knows them (KOE-674): those of the class days that
 * count entries, each once. What the form gives `ownClassErrors` for the stored entries the save reads,
 * so a code an entry holds is neither changed nor removed there either.
 */
export const enteredClassCodes = (classes: readonly Pick<EventClass, 'class' | 'entries'>[]): ClassKey[] => [
  ...new Set(classes.filter((eventClass) => !!eventClass.entries).map((eventClass) => eventClass.class)),
]

/**
 * Whether a key names a class of the event (KOE-674): one of its own classes when it has them,
 * otherwise ALO, AVO or VOI. A classless trial keys its classes by its format, which is never one: a
 * code may not be a type's name.
 */
export const isEventClass = (event: Partial<ClassOwner>, key: string | null | undefined): key is ClassKey =>
  !!key && (event.ownClasses?.length ? ownClassCodes(event).includes(key) : isRegistrationClass(key))

/**
 * Whether the event's class is an official class (KOE-1743): ALO, AVO or VOI and not one of the event's
 * own classes, which may carry the same code. What a reader that filters or counts classes across
 * events takes, the calendar's class filter and the capacity statistics, so an own ALO is never the
 * official ALO there. A classless trial's key, its format, is none.
 */
export const isOfficialClass = (event: ClassOrderOwner, key: string | null | undefined): key is RegistrationClass =>
  isRegistrationClass(key) && !ownClassCodes(event).includes(key)

/**
 * Whether a key is a class the event runs (KOE-674): a key of its kind (`isEventClass`) that is among
 * its `classes`. What a writer holds an entry's class to, and a per-class publish its class.
 */
export const isRunClass = (event: Partial<ClassOwner>, key: string | null | undefined): key is ClassKey =>
  isEventClass(event, key) && !!event.classes?.some((eventClass) => eventClass.class === key)

/**
 * The order of the event's start list (KOE-674): day, then class in the event's order (`classOrder`),
 * then time and number. Every view of the entries reads it, the public list, its spreadsheet and the
 * secretary's lists alike.
 */
export const registrationOrder = (event: Parameters<typeof classOrder>[0]) => registrationSort(classOrder(event))

/**
 * Items that name a registration by its id, in the order the secretary's start list has those
 * registrations (KOE-1652): day, class, time and number (`registrationOrder`). An item whose
 * registration is not in the list goes last, and items the list cannot tell apart keep the order they
 * came in.
 */
export const inRegistrationOrder = <T extends { readonly id: string }>(
  items: readonly T[],
  registrations: readonly (SortableRegistration & { readonly id: string })[],
  event: Parameters<typeof classOrder>[0]
): T[] => {
  const rank = new Map(
    [...registrations].sort(registrationOrder(event)).map((registration, index) => [registration.id, index])
  )
  const rankOf = (item: T) => rank.get(item.id) ?? rank.size
  return [...items].sort((a, b) => rankOf(a) - rankOf(b))
}
