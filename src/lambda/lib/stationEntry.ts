import type { APIGatewayProxyEvent } from 'aws-lambda'
import type {
  JsonConfirmedEvent,
  JsonEventResult,
  JsonEventStation,
  JsonRegistration,
  JsonStationEntry,
  JsonStationEntryDog,
} from '../../types'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { isScorableRegistration, sortRegistrationsByDateClassTimeAndNumber } from '../../lib/registration'
import { LambdaError } from './lambda'
import { getRegistrationEditTokenSecret } from './secrets'

/** Stations created before the field existed have version 1 implicitly, like registration links do. */
const DEFAULT_STATION_TOKEN_VERSION = 1

type StationTokenFields = Pick<JsonEventStation, 'id' | 'tokenVersion'>

/**
 * The station link's token, mirroring `deriveRegistrationEditToken`: HMAC over a domain-prefixed
 * message, revoked by bumping the station's `tokenVersion`. The secret is shared with the registration
 * links on purpose — the `station-entry:` prefix is what keeps the two token families apart, and one
 * secret means no second piece of infrastructure to rotate.
 */
export const deriveStationEntryToken = (eventId: string, station: StationTokenFields, secret: string): string =>
  createHmac('sha256', secret)
    .update(`station-entry:${eventId}:${station.id}:${station.tokenVersion ?? DEFAULT_STATION_TOKEN_VERSION}`)
    .digest('base64url')

export const getStationEntryToken = async (eventId: string, station: StationTokenFields): Promise<string> =>
  deriveStationEntryToken(eventId, station, await getRegistrationEditTokenSecret())

const getBearerToken = (event: Pick<APIGatewayProxyEvent, 'headers'>): string => {
  const authorization = event.headers.Authorization ?? event.headers.authorization ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(authorization)
  return match?.[1] ?? ''
}

const tokensMatch = (actual: string, expected: string): boolean => {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

/**
 * The station a request's Bearer token opens, or a 404 that does not say why. A wrong token, a revoked
 * one and a station that never existed all read the same from outside, exactly as the registration
 * links behave.
 */
export const authorizeStationEntry = async (
  apiEvent: Pick<APIGatewayProxyEvent, 'headers'>,
  eventId: string,
  confirmedEvent: JsonConfirmedEvent,
  stationId: string
): Promise<JsonEventStation> => {
  const station = confirmedEvent.stations?.find((item) => item.id === stationId)
  if (!station) throw new LambdaError(404, 'not found')

  const token = getBearerToken(apiEvent)
  if (!token) throw new LambdaError(404, 'not found')

  const expected = await getStationEntryToken(eventId, station)
  if (!tokensMatch(token, expected)) throw new LambdaError(404, 'not found')

  return station
}

/**
 * The dogs as the link may see them. A station secretary needs the start number, the dog's name and
 * the class to call dogs up — owner and handler details stay off a link this widely shared. The tasks
 * are this post's own: what the other posts recorded is not this link's to see either.
 */
const stationEntryDog = (registration: JsonRegistration, stationId: string): JsonStationEntryDog => {
  const { elimination, retirement } = registration.eventResult ?? {}
  const tasks = registration.eventResult?.tasks?.filter((task) => task.stationId === stationId)

  return {
    class: registration.class,
    dog: { name: registration.dog.name },
    eventType: registration.eventType,
    group: registration.group,
    id: registration.id,
    ...(elimination || retirement || tasks?.length
      ? { eventResult: { ...(elimination ? { elimination } : {}), ...(retirement ? { retirement } : {}), tasks } }
      : {}),
  }
}

/**
 * A stored result as the station's PUT response may echo it: this post's tasks and the round-ending
 * outcomes, with the derived totals and prize stripped. A post's own view withholds the prize on
 * purpose — it depends on posts this link cannot see — so the write path must not hand it back.
 */
export const scopeResultToStation = (result: JsonEventResult, stationId: string): JsonEventResult => {
  const { elimination, retirement, tasks, updatedAt, updatedBy } = result

  return {
    ...(elimination ? { elimination } : {}),
    ...(retirement ? { retirement } : {}),
    ...(tasks ? { tasks: tasks.filter((task) => task.stationId === stationId) } : {}),
    updatedAt,
    updatedBy,
  }
}

export const stationEntryResponse = (
  confirmedEvent: JsonConfirmedEvent,
  station: JsonEventStation,
  registrations: JsonRegistration[]
): JsonStationEntry => {
  const { tokenVersion: _tokenVersion, ...publicStation } = station

  return {
    event: {
      classes: confirmedEvent.classes,
      endDate: confirmedEvent.endDate,
      eventType: confirmedEvent.eventType,
      id: confirmedEvent.id,
      location: confirmedEvent.location,
      name: confirmedEvent.name,
      startDate: confirmedEvent.startDate,
    },
    registrations: registrations
      .filter(isScorableRegistration)
      .sort(sortRegistrationsByDateClassTimeAndNumber)
      .map((registration) => stationEntryDog(registration, station.id)),
    station: publicStation,
  }
}
