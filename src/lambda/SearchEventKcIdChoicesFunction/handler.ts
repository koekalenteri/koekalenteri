import type { JsonDogEvent, Organizer } from '../../types'
import type { KLKoetapahtuma } from '../types/KLAPI'
import { addDays } from 'date-fns'
import { zonedDateString } from '../../i18n/dates'
import { OFFICIAL_EVENT_TYPES } from '../../lib/event'
import { isEventOver } from '../../lib/utils'
import { CONFIG } from '../config'
import { authorizeWithMemberOf } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import KLAPI from '../lib/KLAPI'
import { LambdaError, lambda, response } from '../lib/lambda'
import { getKLAPIConfig } from '../lib/secrets'
import { KLKieli } from '../types/KLAPI'
import CustomDynamoClient from '../utils/CustomDynamoClient'

type KcIdLookupCriteria = Pick<
  JsonDogEvent,
  'classes' | 'endDate' | 'eventType' | 'location' | 'name' | 'startDate'
> & {
  organizer: Pick<JsonDogEvent['organizer'], 'id'>
}

const dynamoDB = new CustomDynamoClient(CONFIG.organizerTable)

const normalize = (value?: string) =>
  (value ?? '')
    .toLocaleLowerCase('fi')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()

const sameDate = (a?: string, b?: string) => Boolean(a && b && a.substring(0, 10) === b.substring(0, 10))

const isLookupCriteria = (value: Partial<KcIdLookupCriteria>): value is KcIdLookupCriteria =>
  Boolean(value.organizer?.id && value.classes && value.endDate && value.eventType && value.startDate)

const klClass = (value: KLKoetapahtuma['luokat'][number]) => (typeof value === 'string' ? value : value.luokka)

const classOverlap = (event: KcIdLookupCriteria, klEvent: KLKoetapahtuma) => {
  const localClasses = new Set<string>(event.classes.map((c) => c.class))
  return klEvent.luokat?.some((c) => localClasses.has(klClass(c))) ?? false
}

const scoreMatch = (event: KcIdLookupCriteria, klEvent: KLKoetapahtuma) => {
  let score = 0
  if (sameDate(event.startDate, klEvent.aika)) score += 4
  if (sameDate(event.endDate, klEvent.päättyy)) score += 2
  if (normalize(event.location) && normalize(event.location) === normalize(klEvent.paikkakunta)) score += 2
  if (normalize(event.name) && normalize(klEvent.tapahtuma).includes(normalize(event.name))) score += 1
  if (classOverlap(event, klEvent)) score += 1
  return score
}

const clean = (value?: string | null) => value?.trim() || undefined

const isChampionship = (klEvent: KLKoetapahtuma) => {
  const type = normalize(klEvent.tyyppi)
  return type === 'sm koe tai muu mestaruusottelu'
}

const toEventType = (klEvent: KLKoetapahtuma) => {
  const eventType = isChampionship(klEvent) ? `${klEvent.lyhenne} SM` : klEvent.lyhenne
  return OFFICIAL_EVENT_TYPES.includes(eventType) ? eventType : klEvent.lyhenne
}

const toKcEventType = (eventType: string) => eventType.replace(/ SM$/, '')

const parseCost = (value?: number | string) => {
  if (typeof value === 'number') return value
  const normalized = value?.replace(',', '.').trim()
  if (!normalized) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

const toDescription = (klEvent: KLKoetapahtuma) =>
  [
    clean(klEvent.lisätiedot ?? klEvent.lisatiedot),
    clean(klEvent.muutLisätiedot),
    ...(klEvent.rajoitukset ?? []).map((restriction) =>
      [
        clean(restriction.tyyppi ?? restriction.rajoituksenTyyppi),
        clean(restriction.lisätieto ?? restriction.lisätiedot),
      ]
        .filter(Boolean)
        .join(': ')
    ),
  ]
    .filter(Boolean)
    .join('\n\n')

const toContactInfo = (klEvent: KLKoetapahtuma) => {
  const secretary = {
    email: clean(klEvent.ilmoittautumiset_Sähköposti),
    name: clean(klEvent.ilmoittautumiset_Nimi),
    phone: clean(klEvent.ilmoittautumiset_Puhelin),
  }

  return Object.values(secretary).some(Boolean) ? { secretary } : undefined
}

const toChoice = (klEvent: KLKoetapahtuma) => {
  const contactInfo = toContactInfo(klEvent)
  const cost = parseCost(klEvent.osallistumismaksu ?? klEvent.osanottomaksu)
  const description = toDescription(klEvent)
  const entryEndDate = klEvent.ilmoittautuminenPäättyy ?? klEvent.ilmoittautumisenLoppu
  const entryStartDate = klEvent.ilmoittautuminenAlkaa ?? klEvent.ilmoittautumisenAlku

  return {
    ...(contactInfo ? { contactInfo } : undefined),
    ...(cost !== undefined ? { cost } : undefined),
    ...(description ? { description } : undefined),
    ...(entryEndDate ? { entryEndDate } : undefined),
    ...(entryStartDate ? { entryStartDate } : undefined),
    endDate: klEvent.päättyy,
    eventType: toEventType(klEvent),
    id: klEvent.id,
    location: [klEvent.paikkakunta, klEvent.paikka].filter(Boolean).join(', '),
    name: klEvent.tapahtuma || clean(klEvent.tarkenne) || '',
    organizer: klEvent.yhdistys,
    startDate: klEvent.aika,
  }
}

const sortChoices = (event: KcIdLookupCriteria, events: KLKoetapahtuma[]) =>
  [...events].sort((a, b) => scoreMatch(event, b) - scoreMatch(event, a))

const isNoResults = (status: number, error?: string) => status === 404 && error?.includes('Ei tulosta')

const findEvents = async (klapi: KLAPI, item: KcIdLookupCriteria, organizerKcId: number, dateMarginDays = 0) =>
  klapi.lueKoetapahtumat({
    Alku: zonedDateString(addDays(item.startDate, -dateMarginDays)),
    Kieli: KLKieli.Suomi,
    Koemuoto: toKcEventType(item.eventType),
    Loppu: zonedDateString(addDays(item.endDate, dateMarginDays)),
    Yhdistys: organizerKcId,
  })

const searchEventKcIdChoicesLambda = lambda('searchEventKcIdChoices', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)
  if (res) return res

  const criteria = parseJSONWithFallback<Partial<KcIdLookupCriteria>>(event.body)
  if (!isLookupCriteria(criteria)) {
    throw new LambdaError(400, 'Organizer ID, event type, classes, start date, and end date are required')
  }

  if (!user.admin && !memberOf.includes(criteria.organizer.id)) {
    throw new LambdaError(403, 'Forbidden')
  }

  if (!OFFICIAL_EVENT_TYPES.includes(criteria.eventType) || isEventOver(criteria)) {
    throw new LambdaError(403, 'Forbidden')
  }

  const organizer = await dynamoDB.read<Organizer>({ id: criteria.organizer.id }, CONFIG.organizerTable)
  if (!organizer?.kcId) {
    throw new LambdaError(400, 'Event organizer does not have Kennel Club ID')
  }

  const klapi = new KLAPI(getKLAPIConfig)
  let { error, json, status } = await findEvents(klapi, criteria, organizer.kcId)

  if (isNoResults(status, error)) {
    json = []
  } else if (status !== 200 || !json) {
    throw new LambdaError(status, `Upstream error: ${error ?? 'Kennel Club event search failed'}`)
  }

  if (!json.length) {
    const broadResult = await findEvents(klapi, criteria, organizer.kcId, 7)
    error = broadResult.error
    json = broadResult.json
    status = broadResult.status

    if (isNoResults(status, error)) {
      json = []
    } else if (status !== 200 || !json) {
      throw new LambdaError(status, `Upstream error: ${error ?? 'Kennel Club event search failed'}`)
    }

    return response(200, { choices: sortChoices(criteria, json).map(toChoice) }, event)
  }

  return response(200, { choices: sortChoices(criteria, json).map(toChoice) }, event)
})

export default searchEventKcIdChoicesLambda
