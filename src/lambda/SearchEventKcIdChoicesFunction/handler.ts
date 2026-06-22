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

const classOverlap = (event: KcIdLookupCriteria, klEvent: KLKoetapahtuma) => {
  const localClasses = new Set<string>(event.classes.map((c) => c.class))
  return klEvent.luokat?.some((c) => localClasses.has(c)) ?? false
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

const toChoice = (klEvent: KLKoetapahtuma) => ({
  endDate: klEvent.päättyy,
  eventType: klEvent.lyhenne,
  id: klEvent.id,
  location: [klEvent.paikkakunta, klEvent.paikka].filter(Boolean).join(', '),
  name: klEvent.tapahtuma,
  organizer: klEvent.yhdistys,
  startDate: klEvent.aika,
})

const sortChoices = (event: KcIdLookupCriteria, events: KLKoetapahtuma[]) =>
  [...events].sort((a, b) => scoreMatch(event, b) - scoreMatch(event, a))

const findEvents = async (klapi: KLAPI, item: KcIdLookupCriteria, organizerKcId: number, dateMarginDays = 0) =>
  klapi.lueKoetapahtumat({
    Alku: zonedDateString(addDays(item.startDate, -dateMarginDays)),
    Kieli: KLKieli.Suomi,
    Koemuoto: item.eventType,
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

  if (status !== 200 || !json) {
    throw new LambdaError(status, `Upstream error: ${error ?? 'Kennel Club event search failed'}`)
  }

  if (!json.length) {
    const broadResult = await findEvents(klapi, criteria, organizer.kcId, 7)
    error = broadResult.error
    json = broadResult.json
    status = broadResult.status

    if (status !== 200 || !json) {
      throw new LambdaError(status, `Upstream error: ${error ?? 'Kennel Club event search failed'}`)
    }

    return response(200, { choices: sortChoices(criteria, json).map(toChoice) }, event)
  }

  return response(200, { choices: sortChoices(criteria, json).map(toChoice) }, event)
})

export default searchEventKcIdChoicesLambda
