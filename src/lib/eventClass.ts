import type { ClassKey, JsonDogEvent, Language } from '../types'
import { compareRegistrationClasses, isOfficialEventType, OFFICIAL_EVENT_TYPES } from './event'
import { isRegistrationClass } from './registration'

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

const ownCodes = (event: Partial<ClassOwner>): string[] => (event.ownClasses ?? []).map(({ code }) => code)

/**
 * Every reason the event save refuses its own classes (KOE-674), read on the event as it would be
 * saved:
 * - an official type runs its official classes, never its own (`isOfficialEventType`);
 * - a code is upper case letters and digits from a letter, ten at most, and the event's classes have
 *   it once;
 * - a code is not the event's own type or an official type, which a classless trial keys its classes
 *   by; the official classes' names are free, as the Hankinome runs ALO, AVO, VOI and VET of its own;
 * - every own class has a Finnish name;
 * - every own class has a class day, and every class day is of an own class;
 * - an entry's class (`registeredClasses`) stays among the own classes, so a code an entry holds is
 *   not changed or removed.
 */
export const ownClassErrors = (
  event: ClassOwner,
  registeredClasses: readonly (ClassKey | null | undefined)[] = []
): OwnClassError[] => {
  const ownClasses = event.ownClasses ?? []
  if (!ownClasses.length) return []
  if (isOfficialEventType(event.eventType)) return [{ kind: 'officialType' }]

  const typeNames = new Set([event.eventType, ...OFFICIAL_EVENT_TYPES].map((name) => name.toUpperCase()))
  const codes = new Set(ownCodes(event))
  const dayClasses = new Set(event.classes?.map((eventClass) => eventClass.class))
  const seen = new Set<string>()
  const errors: OwnClassError[] = []

  for (const { code, name } of ownClasses) {
    if (!OWN_CLASS_CODE.test(code)) errors.push({ code, kind: 'badCode' })
    else if (typeNames.has(code.toUpperCase())) errors.push({ code, kind: 'typeName' })
    if (seen.has(code)) errors.push({ code, kind: 'codeTwice' })
    seen.add(code)
    if (!name.fi?.trim()) errors.push({ code, kind: 'unnamed' })
    if (!dayClasses.has(code)) errors.push({ code, kind: 'noClassDay' })
  }
  for (const code of dayClasses) if (!codes.has(code)) errors.push({ code, kind: 'notOwnClass' })
  for (const code of new Set(registeredClasses)) {
    if (code && !codes.has(code)) errors.push({ code, kind: 'registered' })
  }

  return errors
}

/**
 * Whether a key names a class of the event (KOE-674): one of its own classes when it has them,
 * otherwise ALO, AVO or VOI. A classless trial keys its classes by its format, which is never one: a
 * code may not be a type's name.
 */
export const isEventClass = (event: Partial<ClassOwner>, key: string | null | undefined): key is ClassKey =>
  !!key && (event.ownClasses?.length ? ownCodes(event).includes(key) : isRegistrationClass(key))

/**
 * The order of an event's classes (KOE-674): its own classes as the secretary listed them, then the
 * rest in the official order, ALO, AVO, VOI, and anything else after them.
 */
export const classOrder = (event: Partial<ClassOwner>) => {
  const codes = ownCodes(event)
  const place = (key: string | undefined) => {
    const index = key === undefined ? -1 : codes.indexOf(key)
    return index === -1 ? codes.length : index
  }
  return (a: string | undefined, b: string | undefined): number =>
    place(a) - place(b) || compareRegistrationClasses(a, b)
}

/**
 * A class as a participant reads it (KOE-674): an own class by its name in the reader's language, in
 * Finnish when it has none there, and by its code without either. An official class is its code.
 */
export const classLabel = (event: Partial<ClassOwner>, key: ClassKey, language: Language): string => {
  const ownClass = event.ownClasses?.find(({ code }) => code === key)
  return written(ownClass?.name[language]) ?? written(ownClass?.name.fi) ?? key
}

/** A name that says something: not missing, and not blank. */
const written = (name: string | undefined) => (name?.trim() ? name : undefined)
