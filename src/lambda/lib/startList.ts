import type {
  DogName,
  JsonDog,
  JsonDogEvent,
  JsonPublicDog,
  JsonPublicRegistration,
  JsonPublicRegistrationGroup,
  JsonRegistration,
  PublicTeamPlace,
} from '../../types'
import {
  formatTypeOf,
  isResultsAvailableForRegistration,
  isStartListAvailable,
  isStartListAvailableForRegistration,
  isStartNumbersAvailableForRegistration,
} from '../../lib/event'
import {
  formatOwnerNames,
  getHandlingPerson,
  getRegistrationOwners,
  resolveOwnerSelection,
  sortRegistrationsByDateClassTimeAndNumber,
  withDefaultOwnerSelection,
} from '../../lib/registration'
import { placementsFor, resultMarks, shownEventResult, withStoredTotals } from '../../lib/results'
import { teamMembers } from '../../lib/team'
import { getLiveEvent } from './event'
import { readEventRegistrations } from './repositories/registrationRepository'

/**
 * `ownerHandles` collapses the public row to "owner & handler", which only reads correctly when the
 * single owner handles the dog. With several owners the handler is named separately, even when they
 * are one of the owners. A legacy boolean refers to the single owner on file, and an unset selection
 * is that owner too, as everywhere (KOE-1598); a key that matches no owner publishes `false` rather
 * than guessing.
 */
const publishedOwnerHandles = (reg: JsonRegistration): boolean => {
  if (getRegistrationOwners(reg).length > 1) return false
  const selection = withDefaultOwnerSelection(reg.ownerHandles)
  if (typeof selection !== 'string') return selection
  return !!resolveOwnerSelection(reg.owners, reg.owner, selection)
}

/**
 * Derives the published start list from the event and its registrations. The same rows serve the
 * public fetch and the live broadcast (KOE-1358), so the decision of what a reader may see is made
 * here once and never in the browser.
 *
 * The caller decides whether the list is available at all; `preview` bypasses the per-registration
 * publication checks for the organizer's own preview.
 */
const buildPublicStartList = (
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

  // A round that ended early saved before KOE-1669 has no stored totals; they are worked out from its
  // tasks here, so the list shows what it earned without the row being saved again (KOE-1673).
  const withTotals = registrations.map((reg) => withStoredTotals(confirmedEvent, reg))

  // Derived over everyone who ran, so a withheld row still takes its rank; published only with the result.
  const placements = placementsFor(withTotals, confirmedEvent)

  const rows = withTotals.flatMap((reg): PublishedRow[] => {
    if (!isInEventClasses(confirmedEvent, reg)) return []
    const row = reg.cancelled
      ? cancelledPublicRow(confirmedEvent, reg, preview)
      : publicRow(confirmedEvent, reg, preview, drawn, placements.get(reg.id))
    return row ? [{ id: reg.id, row }] : []
  })
  const publicRegs = withTeams(confirmedEvent.teams, rows)

  // Groups keep their day/class/time order either way; within a group a withheld number falls
  // back to the dog's name, so the unconfirmed list reads alphabetically rather than leaking
  // the draft order through its row positions.
  publicRegs.sort(
    (a, b) =>
      sortRegistrationsByDateClassTimeAndNumber(a, b) || (a.dog.name ?? '').localeCompare(b.dog.name ?? '', 'fi')
  )

  return publicRegs
}

/**
 * The rows, each published member of a team with its team (KOE-1715). The teams name their dogs by
 * registration id, so they never leave the server: a row learns only its own team, and a team none of
 * whose dogs is on the list is named nowhere. The codes come from `teamMembers`, read over the rows
 * that are published, so a reserve's or an unpublished dog's letter stays taken without its row
 * existing. A cancelled dog's row stays its frozen number alone (KOE-1017): a team beside it would tie
 * the absent dog back to a named team.
 */
const withTeams = (teams: JsonDogEvent['teams'], rows: readonly PublishedRow[]): JsonPublicRegistration[] => {
  const running = new Map(rows.filter(({ row }) => !row.cancelled).map(({ id, row }) => [id, row]))
  const places = new Map<JsonPublicRegistration, PublicTeamPlace>()
  teams?.forEach((team, index) => {
    const number = index + 1
    for (const { code, registration } of teamMembers(team, number, running)) {
      places.set(registration, { code, ...(team.name ? { name: team.name } : {}), number })
    }
  })

  return rows.map(({ row }) => {
    const team = places.get(row)
    return team ? { ...row, team } : row
  })
}

/** A published row with the id of its registration, which the row itself never carries. */
interface PublishedRow {
  id: string
  row: JsonPublicRegistration
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

/** A parent as the list names it: its name and titles, whatever else the stored dog holds of it. */
const publicDogName = (parent?: DogName): DogName | undefined => parent && { name: parent.name, titles: parent.titles }

/**
 * The dog as the list shows it (KOE-1489): each field named here, so a field added to the stored dog
 * stays on the server until someone decides the list shows it.
 */
const publicDog = (dog: JsonDog): JsonPublicDog => ({
  breedCode: dog.breedCode,
  dam: publicDogName(dog.dam),
  dob: dog.dob,
  gender: dog.gender,
  name: dog.name,
  regNo: dog.regNo,
  sire: publicDogName(dog.sire),
  titles: dog.titles,
})

/** A running dog's row, or nothing while the reader may not see it yet. */
const publicRow = (
  confirmedEvent: JsonDogEvent,
  reg: JsonRegistration,
  preview: boolean,
  drawn: boolean,
  placement?: number
): JsonPublicRegistration | undefined => {
  const group = reg.group
  if (!group?.date) return undefined
  const registered = { class: reg.class, group }
  if (!preview && !isStartListAvailableForRegistration(confirmedEvent, registered)) return undefined

  const numbersAvailable = isStartNumbersAvailableForRegistration(confirmedEvent, registered)
  if (!preview && numbersAvailable && !reg.startGroup && drawn) return undefined

  return {
    ...(preview ? { numberProvisional: !reg.startGroup } : {}),
    breeder: reg.breeder?.name,
    class: reg.class,
    dog: publicDog(reg.dog),
    group: publicGroup(reg, group, preview, numbersAvailable),
    handler: getHandlingPerson(reg)?.name ?? '',
    owner: formatOwnerNames(reg),
    ownerHandles: publishedOwnerHandles(reg),
    ...(isResultsAvailableForRegistration(confirmedEvent, registered)
      ? publishedResult(confirmedEvent, reg, placement)
      : {}),
  }
}

type PublishedResult = Pick<
  JsonPublicRegistration,
  'marks' | 'maxPoints' | 'percentage' | 'placement' | 'points' | 'result'
>

/**
 * What the row says of the dog's result, once the class's results are published. The marks, the rank
 * and the totals ride with the result and only where it does: on their own they would tell a reader
 * something about a dog whose result is not published yet (KOE-1300, KOE-1673).
 */
const publishedResult = (confirmedEvent: JsonDogEvent, reg: JsonRegistration, placement?: number): PublishedResult => {
  const stored = reg.eventResult
  const marks = resultMarks(stored)
  // Kennelliitto's spelling, as KoiraNet lists it; the stored result keeps its prefix (KOE-1592).
  const result = shownEventResult(stored?.result, formatTypeOf(confirmedEvent), reg.class ?? undefined)

  return {
    ...(marks.length ? { marks } : {}),
    ...(placement ? { placement } : {}),
    ...(result ? publishedTotals(stored) : {}),
    result,
  }
}

/** The points against the whole round, where the round has a maximum; a qualitative type has none. */
const publishedTotals = (
  stored: JsonRegistration['eventResult']
): Pick<PublishedResult, 'maxPoints' | 'percentage' | 'points'> => {
  const { maxPoints, percentage, points } = stored ?? {}
  if (!maxPoints || points === undefined || percentage === undefined) return {}
  return { maxPoints, percentage, points }
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

/**
 * The published start list as both of its readers compose it: the public fetch (GetStartList) and
 * the live message (`publishPublicStartList`). The page orders one against the other by `version`,
 * so they read it the one way (KOE-1516).
 *
 * `version` is the server time taken before the reads, and the reads are consistent: whatever was
 * written before the stamp is in the rows. A list that is not available reads as no rows, without
 * reading the registrations. `checkEvent` sees the event before them and may throw, so a refused
 * caller costs no registration query either. A deleted event answers as a missing one, for the
 * preview too: its page reads the event through the public reader as well (KOE-1586).
 */
export const readPublishedStartList = async (
  eventId: string,
  { checkEvent, preview = false }: { checkEvent?: (event: JsonDogEvent) => void; preview?: boolean } = {}
) => {
  const version = Date.now()
  const confirmedEvent = await getLiveEvent(eventId, true)
  checkEvent?.(confirmedEvent)
  const available = preview || isStartListAvailable(confirmedEvent)
  const participants = available
    ? buildPublicStartList(confirmedEvent, await readEventRegistrations(eventId, true), preview)
    : []

  return { available, participants, version }
}
