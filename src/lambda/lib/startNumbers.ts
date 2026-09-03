import type { JsonConfirmedEvent, JsonRegistration, Patch, RegistrationClass, StartNumbersDayScope } from '../../types'
import { formatDate } from '../../i18n/dates'
import { getStartNumbersClassDays, getStartNumbersDayScope, getStartNumbersPublishedClassMap } from '../../lib/event'
import { getRegistrationClass, isScorableRegistration } from '../../lib/registration'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { LambdaError } from './lambda'
import { removeRegistrationField, updateRegistrationField } from './registration'

const { eventTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

/** One number as the secretary enters it — the on-site draw's result, not a reordering request. */
export interface StartNumberEntry {
  id: string
  startNumber: number
}

/** The day a placement falls on, in the event's time zone — the key the published-days list holds. */
const placementDay = (date: string | Date) => formatDate(date, 'yyyy-MM-dd')

const inScope = (registration: JsonRegistration, eventClass?: RegistrationClass, date?: string) =>
  (!eventClass || getRegistrationClass(registration) === eventClass) &&
  (!date || (!!registration.group?.date && placementDay(registration.group.date) === date))

/**
 * Freeze the published order: each scorable participant's current group becomes its `startGroup`.
 *
 * Publishing is the moment the number turns from a derived ordinal into the dog's own (KOE-1017), so
 * the snapshot is written here — only where none exists yet — and nowhere automatic afterwards. The whole placement is copied,
 * not the bare number: a later cancellation drops the group's date and time, and the public POISSA
 * row still has to land under the right day.
 *
 * A `date` (yyyy-MM-dd) narrows the freeze to that day of the class (KOE-1304): a multi-day class
 * draws each morning, and publishing Friday must leave Saturday's working order alone.
 */
export const freezeStartNumbers = async (
  eventId: string,
  registrations: JsonRegistration[],
  eventClass: RegistrationClass | undefined,
  date?: string
): Promise<Patch<JsonRegistration>[]> => {
  const scoped = registrations.filter(
    (registration) =>
      isScorableRegistration(registration) &&
      Boolean(registration.group?.date) &&
      inScope(registration, eventClass, date)
  )

  // A partly entered draw must not be published: the gaps would freeze to working-order numbers, and
  // a working number can collide with a drawn one (KOE-1218). A number belongs to one dog across
  // every day of the class (KOE-1303), so an undrawn day cannot freeze beside a drawn one either —
  // a multi-day class publishes one day at a time instead (KOE-1304).
  const gaps = new Map<string, number>()
  const entered = new Set<string>()
  for (const registration of scoped) {
    const key = getRegistrationClass(registration) ?? ''
    if (registration.startGroup) entered.add(key)
    else gaps.set(key, (gaps.get(key) ?? 0) + 1)
  }
  for (const [key, count] of gaps) {
    if (entered.has(key)) {
      // Structured so the client can tell "finish the draw first" apart from other 422s (KOE-1218).
      throw new LambdaError(
        422,
        JSON.stringify({
          error: 'startNumbersIncomplete',
          message: `Start numbers are missing for ${count} dogs (${key})`,
        })
      )
    }
  }

  const patches: Patch<JsonRegistration>[] = []
  for (const registration of scoped) {
    // An existing snapshot is already the dog's own number — the venue's entered draw (KOE-1218) or
    // an earlier publish. Freezing over it would replace the drawn numbers with the working order in
    // the same request that makes them public, so publishing only fills the gaps.
    if (registration.startGroup) continue
    if (!registration.group?.date) continue

    const startGroup = { ...registration.group }
    await updateRegistrationField(eventId, registration.id, 'startGroup', startGroup)
    patches.push({ id: registration.id, startGroup })
  }

  return patches
}

/**
 * Write the numbers the venue drew. Validated here rather than only on the form: an integer from 1
 * up, and unique within the class across every day it runs (KOE-1303) — the duplicate the server
 * refuses is the one two phones would otherwise both claim.
 */
export const assignStartNumbers = async (
  eventId: string,
  registrations: JsonRegistration[],
  entries: StartNumberEntry[]
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

    const scopeOf = (candidate: JsonRegistration) =>
      getRegistrationClass(candidate) === getRegistrationClass(registration)

    for (const other of registrations) {
      if (other.id === entry.id || !scopeOf(other)) continue

      const otherNumber = requested.get(other.id) ?? other.startGroup?.number
      if (otherNumber !== entry.startNumber) continue

      // Two dogs asked for the same number in one draw: a form bug or two phones colliding.
      if (requested.has(other.id)) {
        throw new LambdaError(422, `Start number ${entry.startNumber} assigned twice`)
      }

      // A cancelled holder yields its slot: this is how the secretary fills a vacated place, and
      // yielding it removes the POISSA row from the public list "kunnolla", as the ticket asks.
      if (other.cancelled) {
        // Yielding is a REMOVE: DynamoDB refuses `SET startGroup = :undefined`, and `null` in the
        // patch is what tells the clients' patchMerge to delete the field rather than skip it.
        await removeRegistrationField(eventId, other.id, 'startGroup')
        patches.push({ id: other.id, startGroup: null })
        continue
      }

      throw new LambdaError(422, `Start number ${entry.startNumber} is already taken`)
    }

    const startGroup = { ...placement, number: entry.startNumber }
    await updateRegistrationField(eventId, entry.id, 'startGroup', startGroup)
    patches.push({ id: entry.id, startGroup })
  }

  return patches
}

/**
 * One day's publish or hide, folded into the class's scope (KOE-1304): a day list grows and shrinks,
 * collapses to `true` when it covers every day the class runs, and empties to `false`.
 */
const withDay = (
  scope: StartNumbersDayScope,
  days: string[],
  date: string,
  published: boolean
): StartNumbersDayScope => {
  const current = Array.isArray(scope) ? scope.map(placementDay) : scope ? days : []
  const next = published ? [...new Set([...current, date])].sort() : current.filter((day) => day !== date)

  if (next.length === 0) return false
  if (days.every((day) => next.includes(day))) return true
  return next
}

/**
 * Flip the published flag for the class (or the whole classless event) on the event record. With a
 * `date` (yyyy-MM-dd) only that day's numbers change state.
 */
export const setStartNumbersPublishedState = async (
  confirmedEvent: JsonConfirmedEvent,
  eventClass: RegistrationClass | undefined,
  published: boolean,
  date?: string
): Promise<JsonConfirmedEvent['startNumbersPublished']> => {
  const scope: StartNumbersDayScope = date
    ? withDay(
        getStartNumbersDayScope(confirmedEvent, eventClass),
        getStartNumbersClassDays(confirmedEvent, eventClass),
        date,
        published
      )
    : published
  const startNumbersPublished = eventClass
    ? { ...getStartNumbersPublishedClassMap(confirmedEvent), [eventClass]: scope }
    : scope

  await dynamoDB.update({ id: confirmedEvent.id }, { set: { startNumbersPublished } }, eventTable)

  return startNumbersPublished
}
