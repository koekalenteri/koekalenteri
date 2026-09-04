import type { APIGatewayProxyEvent } from 'aws-lambda'
import type {
  JsonConfirmedEvent,
  JsonEventResult,
  JsonEventStation,
  JsonPublicStationTurn,
  JsonRegistration,
  JsonStationEntry,
  JsonStationEntryDog,
  JsonStationTurn,
} from '../../types'
import { resolveStation } from '../../lib/liveFormat'
import { isScorableRegistration, sortRegistrationsByDateClassTimeAndNumber } from '../../lib/registration'
import { scoresAtPosts } from '../../lib/results'
import { linkedEventProjection } from './event'
import { LambdaError } from './lambda'
import { DEFAULT_LINK_TOKEN_VERSION, deriveLinkToken, getBearerToken, linkTokensMatch } from './linkToken'
import { getRegistrationEditTokenSecret } from './secrets'

type StationTokenFields = Pick<JsonEventStation, 'id' | 'tokenVersion'>

/**
 * The station link's token: an HMAC over a domain-prefixed message, revoked by bumping the station's
 * `tokenVersion`.
 */
export const deriveStationEntryToken = (eventId: string, station: StationTokenFields, secret: string): string =>
  deriveLinkToken(
    `station-entry:${eventId}:${station.id}:${station.tokenVersion ?? DEFAULT_LINK_TOKEN_VERSION}`,
    secret
  )

export const getStationEntryToken = async (eventId: string, station: StationTokenFields): Promise<string> =>
  deriveStationEntryToken(eventId, station, await getRegistrationEditTokenSecret())

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
  // The implicit post of a single-post format opens like any other; its version lives on the event
  // only once a revocation has written it there.
  const station = resolveStation(confirmedEvent, stationId)
  if (!station) throw new LambdaError(404, 'not found')

  const token = getBearerToken(apiEvent)
  if (!token) throw new LambdaError(404, 'not found')

  const expected = await getStationEntryToken(eventId, station)
  if (!linkTokensMatch(token, expected)) throw new LambdaError(404, 'not found')

  return station
}

/**
 * The dogs as the link may see them. A judge's secretary needs the start number, the dog's name and
 * the class to call dogs up — owner and handler details stay off a link this widely shared. The tasks
 * are this post's own: what the other posts recorded is not this link's to see either.
 */
const stationEntryDog = (registration: JsonRegistration, stationId: string): JsonStationEntryDog => {
  const stored = registration.eventResult
  const scoped = stored && scopeResultToStation(stored, stationId, registration.eventType)
  // The version rides along — a whole-trial post's next save is based on it; who wrote it does not.
  const { updatedBy: _by, ...eventResult } = scoped ?? {}

  return {
    class: registration.class,
    dog: { name: registration.dog.name },
    eventType: registration.eventType,
    group: registration.group,
    id: registration.id,
    ...(Object.keys(eventResult).length ? { eventResult } : {}),
  }
}

/**
 * A stored result as the station's link may see it: this post's tasks and the round-ending outcomes,
 * with the derived totals and prize stripped. A post's own view withholds the prize on purpose — it
 * depends on posts this link cannot see — so the write path must not hand it back. A qualitative type
 * has no such derivation: its result is the judge's decision, recorded at this very post, and the
 * link needs it back to show the dog as done.
 */
export const scopeResultToStation = (
  result: JsonEventResult,
  stationId: string,
  eventType: string
): JsonEventResult => {
  const { elimination, retirement, tasks, result: verdict, judge, updatedAt, updatedBy } = result
  const qualitative = !scoresAtPosts(eventType)

  return {
    ...(elimination ? { elimination } : {}),
    ...(retirement ? { retirement } : {}),
    ...(tasks?.length ? { tasks: tasks.filter((task) => task.stationId === stationId) } : {}),
    ...(qualitative && verdict ? { result: verdict } : {}),
    ...(qualitative && judge ? { judge } : {}),
    updatedAt,
    updatedBy,
  }
}

/** One post's spans in the public shape: the link that runs the turns sees them without the ids. */
export const publicStationTurns = (turns: JsonStationTurn[] | undefined, stationId: string): JsonPublicStationTurn[] =>
  (turns ?? [])
    .filter((turn) => turn.stationId === stationId)
    .map(({ registrationIds: _registrationIds, ...publicTurn }) => publicTurn)

export const stationEntryResponse = (
  confirmedEvent: JsonConfirmedEvent,
  station: JsonEventStation,
  registrations: JsonRegistration[]
): JsonStationEntry => {
  const { tokenVersion: _tokenVersion, ...publicStation } = station

  return {
    event: linkedEventProjection(confirmedEvent),
    registrations: registrations
      .filter(isScorableRegistration)
      .sort(sortRegistrationsByDateClassTimeAndNumber)
      .map((registration) => stationEntryDog(registration, station.id)),
    station: publicStation,
    turns: publicStationTurns(confirmedEvent.turns, station.id),
  }
}
