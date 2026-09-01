import type { JsonConfirmedEvent, JsonRegistration, Patch, RegistrationClass } from '../../types'
import { getStartNumbersPublishedClassMap } from '../../lib/event'
import { getRegistrationClass, isScorableRegistration } from '../../lib/registration'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { LambdaError } from './lambda'
import { updateRegistrationField } from './registration'

const { eventTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

/** One number as the secretary enters it — the on-site draw's result, not a reordering request. */
export interface StartNumberEntry {
  id: string
  startNumber: number
}

const inScope = (registration: JsonRegistration, eventClass?: RegistrationClass) =>
  !eventClass || getRegistrationClass(registration) === eventClass

/**
 * Freeze the published order: each scorable participant's current group becomes its `startGroup`.
 *
 * Publishing is the moment the number turns from a derived ordinal into the dog's own (KOE-1017), so
 * the snapshot is (re)written here and nowhere automatic afterwards. The whole placement is copied,
 * not the bare number: a later cancellation drops the group's date and time, and the public POISSA
 * row still has to land under the right day.
 */
export const freezeStartNumbers = async (
  eventId: string,
  registrations: JsonRegistration[],
  eventClass: RegistrationClass | undefined
): Promise<Patch<JsonRegistration>[]> => {
  const patches: Patch<JsonRegistration>[] = []

  for (const registration of registrations) {
    if (!isScorableRegistration(registration) || !registration.group?.date) continue
    if (!inScope(registration, eventClass)) continue

    const startGroup = { ...registration.group }
    await updateRegistrationField(eventId, registration.id, 'startGroup', startGroup)
    patches.push({ id: registration.id, startGroup })
  }

  return patches
}

/**
 * Write the numbers the venue drew. Validated here rather than only on the form: an integer from 1
 * up, and unique within the frozen set of the same class and day — the duplicate the server refuses
 * is the one two phones would otherwise both claim.
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
      getRegistrationClass(candidate) === getRegistrationClass(registration) &&
      (candidate.startGroup ?? candidate.group)?.date === placement.date

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
        await updateRegistrationField(eventId, other.id, 'startGroup', undefined)
        patches.push({ id: other.id, startGroup: undefined })
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

/** Flip the published flag for the class (or the whole classless event) on the event record. */
export const setStartNumbersPublishedState = async (
  confirmedEvent: JsonConfirmedEvent,
  eventClass: RegistrationClass | undefined,
  published: boolean
): Promise<JsonConfirmedEvent['startNumbersPublished']> => {
  const startNumbersPublished = eventClass
    ? { ...getStartNumbersPublishedClassMap(confirmedEvent), [eventClass]: published }
    : published

  await dynamoDB.update({ id: confirmedEvent.id }, { set: { startNumbersPublished } }, eventTable)

  return startNumbersPublished
}
