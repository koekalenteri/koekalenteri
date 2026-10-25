import type { DayKey, JsonDogEvent } from '../../types'
import type { KLIntegraatioResult, KLIntHenkilö, KLIntKoe, KLIntKoeListassa } from '../types/KLIntegraatio'
import type KLIntegraatio from './KLIntegraatio'
import { addDays, isDayKey } from '../../lib/day'
import { OFFICIAL_EVENT_TYPES } from '../../lib/event'
import { kcFormatOfEventType } from '../../lib/results'
import { mapWithConcurrency } from '../../lib/utils'
import { LambdaError } from './lambda'
import { logger } from './log'

export type KcIdLookupCriteria = Pick<
  JsonDogEvent,
  'classes' | 'endDate' | 'eventType' | 'location' | 'name' | 'startDate'
> & {
  organizer: Pick<JsonDogEvent['organizer'], 'id'>
}

/** A trial of Koe/Kokeet and, when it has a GUID and Koe/Lue answered, what Koe/Lue adds. */
type Candidate = { koe?: KLIntKoe; listed: KLIntKoeListassa }

/** Koe/Lue is asked for a few candidates at a time. */
const LUE_CONCURRENCY = 3

const NO_RESULT = 'Ei tulosta'

/**
 * Koe/Kokeet does not know every format the old API lists (Testi2 refused NOTO, NOTO-M, NOVA, AJO and
 * KVA, 15.10.2026): there is nothing to find for those, which is an empty result, not a failure.
 */
const UNSUPPORTED_KOEMUOTO = 'Virheellinen koemuoto'

/** The day a Kennel Club timestamp ('2026-09-26T00:00:00', Finnish local time with no zone) names. */
const klDay = (local: string | undefined) => {
  const day = local?.slice(0, 10)
  return isDayKey(day) ? day : undefined
}

const normalize = (value?: string) =>
  (value ?? '')
    .toLocaleLowerCase('fi')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()

/** Whether the event's day (a key, KOE-1547) is the day KL's local date names. */
const sameDate = (eventDate: DayKey, klDate: string | undefined) => {
  const day = klDay(klDate)
  return day !== undefined && eventDate === day
}

/**
 * A trial's last day as KL lists it, or its first day where the listing has no readable end: an empty
 * `loppu`, or the Kennel Club's empty date 0001-01-01 (not a day to `klDay`), is a one-day trial. The
 * choice the client reads and the score that ranks it both take the end from here (KOE-1577). Only
 * listings with a first day get here.
 */
const endOf = (listed: KLIntKoeListassa) => klDay(listed.loppu) ?? klDay(listed.alku)

const classOverlap = (event: KcIdLookupCriteria, koe?: KLIntKoe) => {
  const localClasses = new Set<string>(event.classes.map((c) => c.class))
  return koe?.luokat?.some((c) => localClasses.has(c)) ?? false
}

const scoreMatch = (event: KcIdLookupCriteria, { koe, listed }: Candidate) => {
  let score = 0
  if (sameDate(event.startDate, listed.alku)) score += 4
  if (sameDate(event.endDate, endOf(listed))) score += 2
  if (normalize(event.location) && normalize(event.location) === normalize(listed.paikkakunta)) score += 2
  if (normalize(event.name) && normalize(listed.tapahtuma).includes(normalize(event.name))) score += 1
  if (classOverlap(event, koe)) score += 1
  return score
}

/** The options of a call, when the caller has a signal to give it. */
const callOptions = (signal?: AbortSignal): [] | [{ signal: AbortSignal }] => (signal ? [{ signal }] : [])

const clean = (value?: string | null) => value?.trim() || undefined

const isChampionship = (listed: KLIntKoeListassa) => normalize(listed.tyyppi) === 'sm koe tai muu mestaruusottelu'

/**
 * The event type of the lookup, which is the abbreviation Koe/Kokeet was asked for (its answer names
 * the format in words), with " SM" when the trial is a championship. It never needs Koe/Lue.
 */
const toEventType = (koemuoto: string, listed: KLIntKoeListassa) => {
  const eventType = isChampionship(listed) ? `${koemuoto} SM` : koemuoto
  return OFFICIAL_EVENT_TYPES.includes(eventType) ? eventType : koemuoto
}

const toDescription = (koe: KLIntKoe) =>
  [
    clean(koe.julkisetLisätiedot),
    clean(koe.ilmoittautuminen_Lisätiedot),
    ...(koe.rajoitukset ?? []).map((restriction) =>
      [clean(restriction.rajoitusNimi), clean(restriction.lisätieto)].filter(Boolean).join(': ')
    ),
  ]
    .filter(Boolean)
    .join('\n\n')

const isRegistrationContact = (person: KLIntHenkilö) => person.tehtävä === 'Ilmoittautumisten vastaanottaja'

const toContactInfo = (koe: KLIntKoe) => {
  const person = koe.henkilöstö?.find(isRegistrationContact)
  const secretary = {
    email: clean(person?.sähköposti),
    name: clean(person?.nimi),
    phone: clean(person?.puhelin),
  }

  return Object.values(secretary).some(Boolean) ? { secretary } : undefined
}

/** An entry day KL gives, as a key; nothing for none or for one that names no day. */
const optionalDay = <K extends string>(field: K, local?: string | null) => {
  const day = klDay(clean(local))
  return day ? { [field]: day } : undefined
}

/** What Koe/Lue adds to the choice: the fields Koe/Kokeet does not carry. */
const toDetails = (koe?: KLIntKoe) => {
  if (!koe) return {}
  const contactInfo = toContactInfo(koe)
  const description = toDescription(koe)
  return {
    ...(contactInfo ? { contactInfo } : undefined),
    ...(koe.osallistumismaksu === undefined ? undefined : { cost: koe.osallistumismaksu }),
    ...(description ? { description } : undefined),
    ...optionalDay('entryEndDate', koe.ilmoittautuminen_Loppu),
    ...optionalDay('entryStartDate', koe.ilmoittautuminen_Alku),
    location: [koe.paikkakunta, koe.paikka].filter(Boolean).join(', '),
  }
}

/**
 * A trial with a GUID whose Koe/Lue failed has no `location`: its city alone would differ from the
 * "city, place" the event stores and raise a false location warning once selected. A trial without a
 * GUID cannot be selected, so its city is only shown.
 */
const toLocation = ({ koe, listed }: Candidate) => {
  if (koe) return {}
  return listed.koeGUID ? undefined : { location: listed.paikkakunta }
}

const toChoice = (koemuoto: string, candidate: Candidate) => {
  const { koe, listed } = candidate
  const kcTunnus = clean(listed.koeTunnus)
  const judge = clean(koe?.ylituomariNimi) ?? clean(listed.ylituomariNimi)
  const status = clean(koe?.tilaNimi) ?? clean(listed.tilanNimi)

  return {
    ...toDetails(koe),
    ...toLocation(candidate),
    classes: [...new Set(koe?.luokat ?? [])],
    endDate: endOf(listed),
    eventType: toEventType(koemuoto, listed),
    ...(judge ? { judge } : undefined),
    ...(listed.ylituomariNumero ? { judgeId: listed.ylituomariNumero } : undefined),
    kcGuid: listed.koeGUID,
    ...(kcTunnus ? { kcTunnus } : undefined),
    name: clean(listed.tapahtuma) ?? clean(listed.tarkenne) ?? '',
    organizer: listed.yhdistysNimi,
    startDate: klDay(listed.alku),
    ...(status ? { status } : undefined),
  }
}

const sortCandidates = (event: KcIdLookupCriteria, candidates: Candidate[]) =>
  [...candidates].sort((a, b) => scoreMatch(event, b) - scoreMatch(event, a))

const isNoResults = ({ status, virheet }: KLIntegraatioResult<unknown>) =>
  status === 404 && Boolean(virheet?.some((virhe) => virhe.includes(NO_RESULT) || virhe.includes(UNSUPPORTED_KOEMUOTO)))

const upstreamError = ({ error, status, virheet }: KLIntegraatioResult<unknown>) =>
  // Status 0 is a call that never got an answer: a bad gateway, not a status KL gave.
  new LambdaError(status || 502, `Upstream error: ${virheet?.join(', ') ?? error ?? 'Kennel Club event search failed'}`)

const findEvents = async (
  klint: KLIntegraatio,
  item: KcIdLookupCriteria,
  organizerKcId: number,
  dateMarginDays = 0,
  signal?: AbortSignal
): Promise<KLIntKoeListassa[]> => {
  const result = await klint.lueKokeet(
    {
      alku: addDays(item.startDate, -dateMarginDays),
      koemuoto: kcFormatOfEventType(item.eventType),
      loppu: addDays(item.endDate, dateMarginDays),
      yhdistys: organizerKcId,
    },
    ...callOptions(signal)
  )
  if (isNoResults(result)) return []
  if (result.status !== 200 || !result.json) throw upstreamError(result)
  // A listing without a first day matches no event's days and gives a browser nothing to read: it is
  // left out before the search decides whether to widen to a week's margin.
  return result.json.filter((item) => klDay(item.alku) !== undefined)
}

/**
 * Koe/Kokeet does not carry classes, fee, entry period, contacts, notes or restrictions, so each
 * trial with a GUID is read with Koe/Lue as well. A failed read leaves the trial in with what the
 * list gave; one that turns out to be another format is dropped.
 */
const readDetails = async (klint: KLIntegraatio, koemuoto: string, listed: KLIntKoeListassa, signal?: AbortSignal) => {
  if (!listed.koeGUID) return { listed }
  const { json, status } = await klint.lueKoe({ koeGuid: listed.koeGUID }, ...callOptions(signal))
  if (status !== 200 || !json) {
    logger.warn('KLIntegraatio Koe/Lue failed for a candidate trial', { status })
    return { listed }
  }
  if (json.koemuoto !== koemuoto) {
    logger.warn('KLIntegraatio Koe/Lue answered another koemuoto than the search', { koemuoto: json.koemuoto })
    return undefined
  }
  return { koe: json, listed }
}

/**
 * The trials Kennelliitto lists for an event, best match first. A week's margin is tried when the
 * exact days find nothing. Shared by the lookup the secretary starts and the first sending, which finds
 * the GUID of an event that was linked before GUIDs.
 */
export const searchKcTrials = async (
  klint: KLIntegraatio,
  criteria: KcIdLookupCriteria,
  organizerKcId: number,
  { signal }: { signal?: AbortSignal } = {}
) => {
  const koemuoto = kcFormatOfEventType(criteria.eventType)
  let listed = await findEvents(klint, criteria, organizerKcId, 0, signal)
  if (!listed.length) listed = await findEvents(klint, criteria, organizerKcId, 7, signal)

  const read = await mapWithConcurrency(listed, LUE_CONCURRENCY, (item) => readDetails(klint, koemuoto, item, signal))
  const candidates = read.filter((candidate): candidate is Candidate => candidate !== undefined)

  return sortCandidates(criteria, candidates).map((candidate) => toChoice(koemuoto, candidate))
}
