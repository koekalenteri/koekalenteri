import type { APIGatewayProxyEvent } from 'aws-lambda'
import type {
  EventStation,
  JsonConfirmedEvent,
  JsonEventResult,
  JsonPublicStationTurn,
  JsonRegistration,
  JsonStationEntry,
  JsonStationEntryDog,
  JsonStationEventResult,
  JsonStationTurn,
  StationVisitLayout,
} from '../../types'
import { formatTypeOf } from '../../lib/event'
import { isResultsLocked } from '../../lib/kennelliittoResults'
import { resolveStation, scoresAtPosts } from '../../lib/liveFormat'
import { isScorableRegistration } from '../../lib/registration'
import { stationDogsInOrder } from '../../lib/results'
import { stationExercises, stationTasks } from '../../lib/resultTasks'
import { linkedEventProjection } from './event'
import { LambdaError } from './lambda'
import { DEFAULT_LINK_TOKEN_VERSION, deriveLinkToken, getBearerToken, linkTokensMatch } from './linkToken'
import { getRegistrationEditTokenSecret } from './secrets'

type StationTokenFields = Pick<EventStation, 'id' | 'tokenVersion'>

/**
 * The station link's token: an HMAC over a domain-prefixed message, revoked by bumping the station's
 * `tokenVersion`.
 */
export const deriveStationEntryToken = (eventId: string, station: StationTokenFields, secret: string): string =>
  deriveLinkToken(
    `station-entry:${eventId}:${station.id}:${station.tokenVersion ?? DEFAULT_LINK_TOKEN_VERSION}`,
    secret
  )

export const getStationEntryToken = (eventId: string, station: StationTokenFields): string =>
  deriveStationEntryToken(eventId, station, getRegistrationEditTokenSecret())

/**
 * The station a request's Bearer token opens, or a 404 that does not say why. A wrong token, a revoked
 * one and a station that never existed all read the same from outside, exactly as the registration
 * links behave.
 */
export const authorizeStationEntry = (
  apiEvent: Pick<APIGatewayProxyEvent, 'headers'>,
  eventId: string,
  confirmedEvent: JsonConfirmedEvent,
  stationId: string
): EventStation => {
  // The implicit post of a single-post format opens like any other; its version lives on the event
  // only once a revocation has written it there.
  const station = resolveStation(confirmedEvent, stationId)
  if (!station) throw new LambdaError(404, 'not found')

  const token = getBearerToken(apiEvent)
  if (!token) throw new LambdaError(404, 'not found')

  const expected = getStationEntryToken(eventId, station)
  if (!linkTokensMatch(token, expected)) throw new LambdaError(404, 'not found')

  return station
}

/**
 * The dogs as the link may see them. A judge's secretary needs the start number, the dog's name and
 * the class to call dogs up; owner and handler details stay off a link this widely shared. The tasks
 * are this post's own: what the other posts recorded is not this link's to see either. The visit is
 * what the dog's rotation group does here (KOE-1665), which the link has no rotation to work out.
 */
const stationEntryDog = (
  confirmedEvent: JsonConfirmedEvent,
  registration: JsonRegistration & { visit?: StationVisitLayout },
  stationId: string
): JsonStationEntryDog => {
  const stored = registration.eventResult
  const exercises = stationExercises(confirmedEvent, registration, stationId)

  return {
    class: registration.class,
    dog: { name: registration.dog.name },
    eventType: registration.eventType,
    group: registration.group,
    id: registration.id,
    ...(stored ? { eventResult: scopeResultToStation(stored, exercises, formatTypeOf(confirmedEvent)) } : {}),
    ...(registration.visit ? { visit: registration.visit } : {}),
  }
}

/**
 * A stored result as the station's link may see it: this post's tasks, the exercises the dog's group does
 * there (`stationExercises`, KOE-1665), and the round-ending outcomes, with the derived totals and prize
 * stripped. A post's own view withholds the prize on purpose: it depends on posts this link cannot see,
 * so the write path must not hand it back. A qualitative type
 * has no such derivation: its result is the judge's decision, recorded at this very post, and the
 * link needs it back to show the dog as done.
 *
 * No writer's name goes out, of the result or of a task: the link is widely shared, and every answer it
 * gets is made here, the load, a save's echo and a conflict alike. The tasks' `updatedAt` stays, since a
 * post's next save is based on it, and so does the result's for a whole-trial post.
 */
export const scopeResultToStation = (
  result: JsonEventResult,
  exercises: readonly number[],
  eventType: string
): JsonStationEventResult => {
  const { elimination, retirement, tasks, result: verdict, judge, updatedAt } = result
  const qualitative = !scoresAtPosts(eventType)

  return {
    ...(elimination ? { elimination } : {}),
    ...(retirement ? { retirement } : {}),
    ...(tasks?.length ? { tasks: stationTasks(tasks, exercises).map(({ updatedBy: _by, ...task }) => task) } : {}),
    ...(qualitative && verdict ? { result: verdict } : {}),
    ...(qualitative && judge ? { judge } : {}),
    updatedAt,
  }
}

/** One post's spans in the public shape: the link that runs the turns sees them without the ids. */
export const publicStationTurns = (turns: JsonStationTurn[] | undefined, stationId: string): JsonPublicStationTurn[] =>
  (turns ?? [])
    .filter((turn) => turn.stationId === stationId)
    .map(({ registrationIds: _registrationIds, ...publicTurn }) => publicTurn)

export const stationEntryResponse = (
  confirmedEvent: JsonConfirmedEvent,
  station: EventStation,
  registrations: JsonRegistration[]
): JsonStationEntry => {
  const { tokenVersion: _tokenVersion, ...publicStation } = station

  return {
    event: { ...linkedEventProjection(confirmedEvent), ...(isResultsLocked(confirmedEvent) ? { locked: true } : {}) },
    // In the order the rotation groups reach the post; a dog whose group does not come here is not listed.
    registrations: stationDogsInOrder(confirmedEvent, station.id, registrations.filter(isScorableRegistration)).map(
      (registration) => stationEntryDog(confirmedEvent, registration, station.id)
    ),
    station: publicStation,
    turns: publicStationTurns(confirmedEvent.turns, station.id),
  }
}
