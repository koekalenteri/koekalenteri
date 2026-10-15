import type { JsonDogEvent, JsonEventType, Organizer } from '../../types'
import type KLIntegraatio from '../lib/KLIntegraatio'
import type { KLIntegraatioResult, KLIntHenkilö, KLIntKoe, KLIntKoeListassa } from '../types/KLIntegraatio'
import { TZDate } from '@date-fns/tz'
import { addDays } from 'date-fns/addDays'
import { TIME_ZONE, zonedDateString } from '../../i18n/dates'
import { isOfficialEventType, OFFICIAL_EVENT_TYPES } from '../../lib/event'
import { mapWithConcurrency } from '../../lib/utils'
import { CONFIG } from '../config'
import { authorizeWithMemberOf } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { getKLIntegraatio } from '../lib/KLIntegraatio'
import { LambdaError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import CustomDynamoClient from '../utils/CustomDynamoClient'

type KcIdLookupCriteria = Pick<
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

const dynamoDB = new CustomDynamoClient(CONFIG.organizerTable)

const normalize = (value?: string) =>
  (value ?? '')
    .toLocaleLowerCase('fi')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()

/**
 * The event stores an instant (the start of its day in Finland, the evening before in UTC) and KL a
 * bare local date, so the event's day is read in the local zone. Comparing the first ten characters
 * of both strings never matched a start date.
 */
const sameDate = (eventDate: string, klDate: string) =>
  Boolean(klDate) && zonedDateString(new Date(eventDate)) === klDate.substring(0, 10)

const isLookupCriteria = (value: Partial<KcIdLookupCriteria>): value is KcIdLookupCriteria =>
  Boolean(value.organizer?.id && value.classes && value.endDate && value.eventType && value.startDate)

const classOverlap = (event: KcIdLookupCriteria, koe?: KLIntKoe) => {
  const localClasses = new Set<string>(event.classes.map((c) => c.class))
  return koe?.luokat?.some((c) => localClasses.has(c)) ?? false
}

const scoreMatch = (event: KcIdLookupCriteria, { koe, listed }: Candidate) => {
  let score = 0
  if (sameDate(event.startDate, listed.alku)) score += 4
  if (sameDate(event.endDate, listed.loppu)) score += 2
  if (normalize(event.location) && normalize(event.location) === normalize(listed.paikkakunta)) score += 2
  if (normalize(event.name) && normalize(listed.tapahtuma).includes(normalize(event.name))) score += 1
  if (classOverlap(event, koe)) score += 1
  return score
}

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

const toKcEventType = (eventType: string) => eventType.replace(/ SM$/, '')

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

/** What Koe/Lue adds to the choice: the fields Koe/Kokeet does not carry. */
const toDetails = (koe?: KLIntKoe) => {
  if (!koe) return {}
  const contactInfo = toContactInfo(koe)
  const description = toDescription(koe)
  return {
    ...(contactInfo ? { contactInfo } : undefined),
    ...(koe.osallistumismaksu === undefined ? undefined : { cost: koe.osallistumismaksu }),
    ...(description ? { description } : undefined),
    ...(clean(koe.ilmoittautuminen_Loppu) ? { entryEndDate: koe.ilmoittautuminen_Loppu } : undefined),
    ...(clean(koe.ilmoittautuminen_Alku) ? { entryStartDate: koe.ilmoittautuminen_Alku } : undefined),
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
    endDate: listed.loppu,
    eventType: toEventType(koemuoto, listed),
    ...(judge ? { judge } : undefined),
    ...(listed.ylituomariNumero ? { judgeId: listed.ylituomariNumero } : undefined),
    kcGuid: listed.koeGUID,
    ...(kcTunnus ? { kcTunnus } : undefined),
    name: clean(listed.tapahtuma) ?? clean(listed.tarkenne) ?? '',
    organizer: listed.yhdistysNimi,
    startDate: listed.alku,
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

/**
 * The Finnish day `days` days from the one the instant falls on. The step is taken in Finnish time:
 * stepping the instant by 24 hours in the Lambda's own zone (UTC) is a day off across the change
 * to or from summer time.
 */
const shiftedDay = (instant: string, days: number) => zonedDateString(addDays(new TZDate(instant, TIME_ZONE), days))

const findEvents = async (
  klint: KLIntegraatio,
  item: KcIdLookupCriteria,
  organizerKcId: number,
  dateMarginDays = 0
): Promise<KLIntKoeListassa[]> => {
  const result = await klint.lueKokeet({
    alku: shiftedDay(item.startDate, -dateMarginDays),
    koemuoto: toKcEventType(item.eventType),
    loppu: shiftedDay(item.endDate, dateMarginDays),
    yhdistys: organizerKcId,
  })
  if (isNoResults(result)) return []
  if (result.status !== 200 || !result.json) throw upstreamError(result)
  return result.json
}

/**
 * Koe/Kokeet does not carry classes, fee, entry period, contacts, notes or restrictions, so each
 * trial with a GUID is read with Koe/Lue as well. A failed read leaves the trial in with what the
 * list gave; one that turns out to be another format is dropped.
 */
const readDetails = async (klint: KLIntegraatio, koemuoto: string, listed: KLIntKoeListassa) => {
  if (!listed.koeGUID) return { listed }
  const { json, status } = await klint.lueKoe({ koeGuid: listed.koeGUID })
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

const searchEventKcIdChoicesLambda = lambda('searchEventKcIdChoices', async (event) => {
  const { user, memberOf } = await authorizeWithMemberOf(event)

  const criteria = parseJSONWithFallback<Partial<KcIdLookupCriteria>>(event.body)
  if (!isLookupCriteria(criteria)) {
    throw new LambdaError(400, 'Organizer ID, event type, classes, start date, and end date are required')
  }

  if (!user.admin && !memberOf.includes(criteria.organizer.id)) {
    throw new LambdaError(403, 'Forbidden')
  }

  const koemuoto = toKcEventType(criteria.eventType)
  const eventType = await dynamoDB.read<JsonEventType>({ eventType: koemuoto }, CONFIG.eventTypeTable)

  // Only official event types have a Kennelliitto trial to find. A past event is deliberately not
  // refused (the KOE-85 gate used to): the lookup's own use case is results entry (KOE-452), which
  // happens the evening after the event, or days later.
  if (!isOfficialEventType(criteria.eventType, eventType?.official)) {
    throw new LambdaError(403, 'Forbidden')
  }

  const organizer = await dynamoDB.read<Organizer>({ id: criteria.organizer.id }, CONFIG.organizerTable)
  if (!organizer?.kcId) {
    throw new LambdaError(400, 'Event organizer does not have Kennel Club ID')
  }

  const klint = getKLIntegraatio()
  let listed = await findEvents(klint, criteria, organizer.kcId)
  if (!listed.length) listed = await findEvents(klint, criteria, organizer.kcId, 7)

  const read = await mapWithConcurrency(listed, LUE_CONCURRENCY, (item) => readDetails(klint, koemuoto, item))
  const candidates = read.filter((candidate): candidate is Candidate => candidate !== undefined)

  return response(
    200,
    { choices: sortCandidates(criteria, candidates).map((candidate) => toChoice(koemuoto, candidate)) },
    event
  )
})

export default searchEventKcIdChoicesLambda
