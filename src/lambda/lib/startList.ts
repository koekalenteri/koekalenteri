import type { JsonDogEvent, JsonPublicRegistration, JsonPublicRegistrationGroup, JsonRegistration } from '../../types'
import {
  isResultsAvailableForRegistration,
  isStartListAvailableForRegistration,
  isStartNumbersAvailableForRegistration,
} from '../../lib/event'
import {
  formatOwnerNames,
  getHandlingPerson,
  getRegistrationOwners,
  resolveOwnerSelection,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { resultMarks } from '../../lib/results'

/**
 * `ownerHandles` collapses the public row to "owner & handler", which only reads correctly when the
 * single owner handles the dog. With several owners the handler is named separately, even when they
 * are one of the owners. A legacy boolean refers to the single owner on file; a key that matches no
 * owner publishes `false` rather than guessing.
 */
const publishedOwnerHandles = (reg: JsonRegistration): boolean | undefined => {
  const { ownerHandles } = reg
  if (ownerHandles === undefined) return undefined
  if (getRegistrationOwners(reg).length > 1) return false
  if (typeof ownerHandles !== 'string') return !!ownerHandles
  return !!resolveOwnerSelection(reg.owners, reg.owner, ownerHandles)
}

/**
 * Derives the published start list from the event and its registrations. The same rows serve the
 * public fetch and the live broadcast (KOE-1358), so the decision of what a reader may see is made
 * here once and never in the browser.
 *
 * The caller decides whether the list is available at all; `preview` bypasses the per-registration
 * publication checks for the organizer's own preview.
 */
export const buildPublicStartList = (
  confirmedEvent: JsonDogEvent,
  registrations: JsonRegistration[],
  preview = false
): JsonPublicRegistration[] => {
  // Whether the venue draw has been entered at all. A dog added after the numbers went out has no
  // entered number of its own, and its working-order number could shadow a drawn one — a number is
  // one dog's in the whole trial (KOE-1303) — so such a dog stays off the published list until its
  // number is entered (KOE-1272). Events from before entered numbers existed have no startGroup
  // anywhere and are unaffected.
  const drawn = registrations.some((reg) => !reg.cancelled && reg.startGroup?.date)

  const publicRegs = registrations
    .filter((reg) => isInEventClasses(confirmedEvent, reg))
    .map((reg) =>
      reg.cancelled ? cancelledPublicRow(confirmedEvent, reg, preview) : publicRow(confirmedEvent, reg, preview, drawn)
    )
    .filter((row) => row !== undefined)

  // Groups keep their day/class/time order either way; within a group a withheld number falls
  // back to the dog's name, so the unconfirmed list reads alphabetically rather than leaking
  // the draft order through its row positions.
  publicRegs.sort(
    (a, b) =>
      sortRegistrationsByDateClassTimeAndNumber(a, b) || (a.dog.name ?? '').localeCompare(b.dog.name ?? '', 'fi')
  )

  return publicRegs
}

/** Keep preview limited to event classes even though it bypasses publication checks. */
const isInEventClasses = (confirmedEvent: JsonDogEvent, reg: JsonRegistration) =>
  !confirmedEvent.classes?.length || confirmedEvent.classes.some((eventClass) => eventClass.class === reg.class)

/**
 * A cancelled dog appears as its frozen number and nothing more (KOE-1017): the number is published
 * truth and must not slide onto the next dog, but the dog itself, its owner and its handler are no
 * longer anyone's business. The narrow row is built here rather than filtered in the browser, so
 * the details never leave the server.
 */
const cancelledPublicRow = (
  confirmedEvent: JsonDogEvent,
  reg: JsonRegistration,
  preview: boolean
): JsonPublicRegistration | undefined => {
  const placement = reg.startGroup
  if (!placement?.date) return undefined
  const probe = { class: reg.class, group: placement }
  const published =
    isStartListAvailableForRegistration(confirmedEvent, probe) &&
    isStartNumbersAvailableForRegistration(confirmedEvent, probe)
  if (!preview && !published) return undefined

  return {
    breeder: '',
    cancelled: true,
    class: reg.class,
    dog: { name: '', regNo: '' },
    group: placement,
    handler: '',
    owner: '',
  }
}

/** A running dog's row, or nothing while the reader may not see it yet. */
const publicRow = (
  confirmedEvent: JsonDogEvent,
  reg: JsonRegistration,
  preview: boolean,
  drawn: boolean
): JsonPublicRegistration | undefined => {
  const group = reg.group
  if (!group?.date) return undefined
  const registered = { class: reg.class, group }
  if (!preview && !isStartListAvailableForRegistration(confirmedEvent, registered)) return undefined

  const numbersAvailable = isStartNumbersAvailableForRegistration(confirmedEvent, registered)
  if (!preview && numbersAvailable && !reg.startGroup && drawn) return undefined

  const marks = resultMarks(reg.eventResult)

  return {
    ...(preview ? { numberProvisional: !reg.startGroup } : {}),
    breeder: reg.breeder?.name,
    class: reg.class,
    dog: reg.dog,
    group: publicGroup(reg, group, preview, numbersAvailable),
    handler: getHandlingPerson(reg)?.name ?? '',
    owner: formatOwnerNames(reg),
    ownerHandles: publishedOwnerHandles(reg),
    // The marks ride with the result and only where it does: a mark on its own would tell a reader
    // something about a dog whose result is not published yet (KOE-1300).
    ...(isResultsAvailableForRegistration(confirmedEvent, registered)
      ? { ...(marks.length ? { marks } : {}), result: reg.eventResult?.result }
      : {}),
  }
}

/**
 * The published number is the frozen one. The preview shows it too, as soon as it exists
 * (KOE-1218): the secretary entered it and expects to see it back; the working order fills in only
 * where no number has been drawn, and is flagged provisional so the preview can render it as such.
 * Until the class's numbers are published the public number is withheld (KOE-1006): the dogs are
 * real but the order is not, and a number that still moves must not look like a promise.
 */
const publicGroup = (
  reg: JsonRegistration,
  group: JsonPublicRegistrationGroup,
  preview: boolean,
  numbersAvailable: boolean
): JsonPublicRegistrationGroup => {
  if (!preview && !numbersAvailable) return { ...group, number: undefined }
  return reg.startGroup ?? group
}
