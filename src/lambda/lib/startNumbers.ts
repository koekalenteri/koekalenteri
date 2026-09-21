import type { StartNumbersTime } from '../../lib/event'
import type { JsonConfirmedEvent, JsonRegistration, Patch, RegistrationClass, StartNumbersDayScope } from '../../types'
import { formatDate } from '../../i18n/dates'
import {
  getStartNumbersClassDays,
  getStartNumbersDayScope,
  getStartNumbersPublishedClassMap,
  startNumbersSlotKey,
} from '../../lib/event'
import { getRegistrationClass, isScorableRegistration } from '../../lib/registration'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { audit, registrationAuditKey } from './audit'
import { httpError, LambdaError } from './lambda'
import { removeRegistrationField, updateRegistrationField } from './registration'

const { eventTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

/** One number as the secretary enters it — the on-site draw's result, not a reordering request. */
export interface StartNumberEntry {
  id: string
  startNumber: number
}

const isStartNumberEntry = (value: unknown): value is StartNumberEntry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as StartNumberEntry).id === 'string' &&
  typeof (value as StartNumberEntry).startNumber === 'number'

/** The entries of a request body, whatever the body turned out to be. */
export const parseStartNumberEntries = (numbers: unknown): StartNumberEntry[] =>
  Array.isArray(numbers) ? numbers.filter(isStartNumberEntry) : []

/** The day a placement falls on, in the event's time zone — the key the published-days list holds. */
const placementDay = (date: string | Date) => formatDate(date, 'yyyy-MM-dd')

const inScope = (
  registration: JsonRegistration,
  eventClass?: RegistrationClass,
  date?: string,
  time?: StartNumbersTime
) =>
  (!eventClass || getRegistrationClass(registration) === eventClass) &&
  (!date || (!!registration.group?.date && placementDay(registration.group.date) === date)) &&
  (!time || registration.group?.time === time)

/**
 * The dog's own trail says what its number is (KOE-1355). The event trail records the publish as one
 * line for the whole class, which does not answer the secretary's question about one dog: the work
 * list shows number 13, and the trail has to say where that came from and when it went public.
 */
const auditStartNumber = (registration: JsonRegistration, message: string, user: string) =>
  audit({ auditKey: registrationAuditKey(registration), message, user })

/**
 * Freeze the published order: each scorable participant's current group becomes its `startGroup`.
 *
 * Publishing is the moment the number turns from a derived ordinal into the dog's own (KOE-1017), so
 * the snapshot is written here — only where none exists yet — and nowhere automatic afterwards. The whole placement is copied,
 * not the bare number: a later cancellation drops the group's date and time, and the public POISSA
 * row still has to land under the right day.
 *
 * A `date` (yyyy-MM-dd) narrows the freeze to that day of the class (KOE-1304): a multi-day class
 * draws each morning, and publishing Friday must leave Saturday's working order alone. A `time`
 * narrows it further to the morning or the afternoon of that day (KOE-1430), for a trial that draws
 * the afternoon only once the morning is under way: the morning's dogs are complete and go out, and
 * the afternoon's undrawn numbers are not gaps in it.
 */
export const freezeStartNumbers = async (
  eventId: string,
  registrations: JsonRegistration[],
  eventClass: RegistrationClass | undefined,
  user: string,
  date?: string,
  time?: StartNumbersTime
): Promise<Patch<JsonRegistration>[]> => {
  const scoped = registrations.filter(
    (registration) =>
      isScorableRegistration(registration) &&
      Boolean(registration.group?.date) &&
      inScope(registration, eventClass, date, time)
  )

  // A partly entered draw must not be published: the gaps would freeze to working-order numbers, and
  // a working number can collide with a drawn one (KOE-1218). A number belongs to one dog in the
  // whole trial, every class and every day (KOE-1303), so once any number has been entered, nothing
  // freezes from the working order any more — an undrawn day or class waits for its own draw, and a
  // multi-day class publishes one day at a time (KOE-1304). An event whose draw was never entered
  // has no entered number anywhere and freezes its working order as before.
  const entered = registrations.some((registration) => isScorableRegistration(registration) && registration.startGroup)
  const gaps = scoped.filter((registration) => !registration.startGroup).length
  if (entered && gaps > 0) {
    // Structured so the client can tell "finish the draw first" apart from other 422s (KOE-1218).
    throw httpError(422, {
      count: gaps,
      error: 'startNumbersIncomplete',
      ...(eventClass ? { eventClass } : {}),
      message: `Start numbers are missing for ${gaps} dogs${eventClass ? ` (${eventClass})` : ''}`,
    })
  }

  const patches: Patch<JsonRegistration>[] = []
  for (const registration of scoped) {
    if (!registration.group?.date) continue

    // An existing snapshot is already the dog's own number — the venue's entered draw (KOE-1218) or
    // an earlier publish. Freezing over it would replace the drawn numbers with the working order in
    // the same request that makes them public, so publishing only fills the gaps. The number still
    // goes public here, so the dog's trail records the publish either way (KOE-1355).
    const startGroup = registration.startGroup ?? { ...registration.group }
    if (!registration.startGroup) {
      await updateRegistrationField(eventId, registration.id, 'startGroup', startGroup)
      patches.push({ id: registration.id, startGroup })
    }

    await auditStartNumber(registration, `Starttinumero julkaistu: ${startGroup.number}`, user)
  }

  return patches
}

/**
 * Write the numbers the venue drew. Validated here rather than only on the form: an integer from 1
 * up, and unique in the whole trial — every class, every day (KOE-1303). The duplicate the server
 * refuses is the one two phones would otherwise both claim.
 */
/**
 * A refused number, in a shape the entry form can say something useful about. The screen that hits
 * this is often a class secretary's link, which shows one class of one day: the dog holding the
 * number can be in another class entirely, and then "check the numbers and try again" points at a
 * sheet where nothing is wrong (KOE-1267). The number, and the class that holds it, are what turns
 * that into something the reader can act on.
 */
const refusedNumber = (error: string, number: number, reason: string, eventClass?: string) =>
  httpError(422, {
    error,
    ...(eventClass ? { eventClass } : {}),
    message: `Start number ${number} ${reason}`,
    number,
  })

export const assignStartNumbers = async (
  eventId: string,
  registrations: JsonRegistration[],
  entries: StartNumberEntry[],
  user: string
): Promise<Patch<JsonRegistration>[]> => {
  const patches: Patch<JsonRegistration>[] = []
  const byId = new Map(registrations.map((registration) => [registration.id, registration]))

  for (const entry of entries) {
    if (!Number.isInteger(entry.startNumber) || entry.startNumber < 1) {
      throw new LambdaError(422, `Invalid start number '${entry.startNumber}'`)
    }
    if (!byId.has(entry.id)) throw new LambdaError(404, `Registration '${entry.id}' not found`)
  }

  const requested = new Map(entries.map((entry) => [entry.id, entry.startNumber]))

  for (const entry of entries) {
    const registration = byId.get(entry.id)
    if (!registration) continue
    const placement = registration.startGroup ?? registration.group
    if (!placement?.date) {
      throw new LambdaError(422, `Registration '${entry.id}' has no start slot to number`)
    }

    for (const other of registrations) {
      if (other.id === entry.id) continue

      const otherNumber = requested.get(other.id) ?? other.startGroup?.number
      if (otherNumber !== entry.startNumber) continue

      // Two dogs asked for the same number in one draw: a form bug or two phones colliding.
      if (requested.has(other.id)) {
        throw refusedNumber('startNumberAssignedTwice', entry.startNumber, `assigned twice`)
      }

      // A holder that is no longer running yields its slot: this is how the secretary fills a
      // vacated place, and yielding it removes the POISSA row from the public list "kunnolla", as
      // KOE-1218 asks. Cancelling is the common way out of the participant list, but not the only
      // one — a dog moved back to the reserve list is off it just as surely, and holding a number it
      // will not start under leaves that number unusable by anyone (KOE-1428).
      if (!isScorableRegistration(other)) {
        // Yielding is a REMOVE: DynamoDB refuses `SET startGroup = :undefined`, and `null` in the
        // patch is what tells the clients' patchMerge to delete the field rather than skip it.
        await removeRegistrationField(eventId, other.id, 'startGroup')
        patches.push({ id: other.id, startGroup: null })
        await auditStartNumber(other, `Starttinumero vapautettu: ${entry.startNumber}`, user)
        continue
      }

      throw refusedNumber(
        'startNumberTaken',
        entry.startNumber,
        `is already taken`,
        getRegistrationClass(other) ?? undefined
      )
    }

    const startGroup = { ...placement, number: entry.startNumber }
    await updateRegistrationField(eventId, entry.id, 'startGroup', startGroup)
    patches.push({ id: entry.id, startGroup })

    // The previous number is part of the answer: a corrected entry reads as the correction it is,
    // not as a number that has always been the dog's (KOE-1355).
    const previous = registration.startGroup?.number
    const change = previous !== undefined && previous !== entry.startNumber ? `${previous} -> ` : ''
    await auditStartNumber(registration, `Starttinumero tallennettu: ${change}${entry.startNumber}`, user)
  }

  return patches
}

/** The stored entries of a scope as slot keys; a stored day may have come back as a date. */
const scopeSlotKeys = (scope: Array<string | Date>) =>
  scope.map((entry) => (typeof entry === 'string' && entry.includes('/') ? entry : placementDay(entry)))

const isHalfOf = (date: string) => (key: string) => key.startsWith(`${date}/`)

/**
 * One slot's publish or hide, folded into the class's scope (KOE-1304, KOE-1430): the list grows and
 * shrinks, a day whose every half is out collapses to the bare day, the scope collapses to `true`
 * when it covers every day the class runs, and empties to `false`.
 *
 * `dayTimes` are the halves the day runs in, so hiding one half of a published day leaves the other
 * half out, and publishing the last half makes the day whole.
 */
const withSlot = (
  scope: StartNumbersDayScope,
  days: string[],
  dayTimes: StartNumbersTime[],
  date: string,
  time: StartNumbersTime | undefined,
  published: boolean
): StartNumbersDayScope => {
  let current: string[] = []
  if (Array.isArray(scope)) current = scopeSlotKeys(scope)
  else if (scope) current = days
  const half = isHalfOf(date)
  const slot = startNumbersSlotKey(date, time)

  let next: string[]
  if (!time) {
    // The whole day: its halves have nothing to add or keep.
    next = published
      ? [...current.filter((key) => !half(key)), date]
      : current.filter((key) => key !== date && !half(key))
  } else if (published) {
    next = current.includes(date) ? current : [...current, slot]
  } else if (current.includes(date)) {
    // Hiding one half of a whole day: the other halves stay out on their own.
    next = [
      ...current.filter((key) => key !== date),
      ...dayTimes.filter((other) => other !== time).map((other) => startNumbersSlotKey(date, other)),
    ]
  } else {
    next = current.filter((key) => key !== slot)
  }

  const halves = dayTimes.map((other) => startNumbersSlotKey(date, other))
  if (halves.length > 0 && !next.includes(date) && halves.every((key) => next.includes(key))) {
    next = [...next.filter((key) => !half(key)), date]
  }
  next = [...new Set(next)].sort((a, b) => a.localeCompare(b))

  if (next.length === 0) return false
  if (days.every((day) => next.includes(day))) return true
  return next
}

interface StartNumbersPublishScope {
  /** The class whose numbers change state; absent for a classless event. */
  eventClass?: RegistrationClass
  published: boolean
  /** One day (yyyy-MM-dd) of the class; absent for the whole class (KOE-1304). */
  date?: string
  /** One half of that day (KOE-1430); needs `date`. */
  time?: StartNumbersTime
  /** The halves that day runs in, so a day out by halves can become whole — and be split again. */
  dayTimes?: StartNumbersTime[]
}

/**
 * Flip the published flag for the class (or the whole classless event) on the event record. With a
 * `date` (yyyy-MM-dd) only that day's numbers change state; with a `time` too, only that half's.
 *
 * `updatedAt` moves with the flag so an incremental fetch carries it: a browser that already holds
 * the event reads nothing older, and without this it kept showing the numbers as unconfirmed after
 * they went out (KOE-1352). `modifiedAt` stays — publishing is not an edit to the event.
 */
export const setStartNumbersPublishedState = async (
  confirmedEvent: JsonConfirmedEvent,
  { dayTimes = [], date, eventClass, published, time }: StartNumbersPublishScope,
  now: Date = new Date()
): Promise<Pick<JsonConfirmedEvent, 'startNumbersPublished' | 'updatedAt'>> => {
  const scope: StartNumbersDayScope = date
    ? withSlot(
        getStartNumbersDayScope(confirmedEvent, eventClass),
        getStartNumbersClassDays(confirmedEvent, eventClass),
        dayTimes,
        date,
        time,
        published
      )
    : published
  const startNumbersPublished = eventClass
    ? { ...getStartNumbersPublishedClassMap(confirmedEvent), [eventClass]: scope }
    : scope

  const updatedAt = now.toISOString()
  await dynamoDB.update({ id: confirmedEvent.id }, { set: { startNumbersPublished, updatedAt } }, eventTable)

  return { startNumbersPublished, updatedAt }
}
