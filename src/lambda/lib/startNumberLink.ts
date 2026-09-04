import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonClassStartNumberDog, JsonClassStartNumbers, JsonConfirmedEvent, JsonRegistration } from '../../types'
import type { StartNumberEntry } from './startNumbers'
import { uniqueClasses } from '../../lib/event'
import {
  getRegistrationClass,
  isScorableRegistration,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { linkedEventProjection } from './event'
import { LambdaError } from './lambda'
import { DEFAULT_LINK_TOKEN_VERSION, deriveLinkToken, getBearerToken, linkTokensMatch } from './linkToken'
import { getRegistrationEditTokenSecret } from './secrets'

type LinkVersionFields = Pick<JsonConfirmedEvent, 'startNumberLinkVersions'>

/** The classes a link can be issued for: the trial's own, or its event type where it runs none. */
export const startNumberLinkClasses = (confirmedEvent: Pick<JsonConfirmedEvent, 'classes' | 'eventType'>): string[] => {
  const classes = uniqueClasses(confirmedEvent)
  return classes.length ? classes : [confirmedEvent.eventType]
}

const startNumberLinkVersion = (event: LinkVersionFields, eventClass: string): number =>
  event.startNumberLinkVersions?.[eventClass] ?? DEFAULT_LINK_TOKEN_VERSION

/**
 * The class secretary's link token (KOE-1267), the post link's sibling: an HMAC over a
 * domain-prefixed message, revoked by bumping the class's entry in `startNumberLinkVersions`.
 */
export const deriveStartNumberLinkToken = (
  eventId: string,
  eventClass: string,
  version: number,
  secret: string
): string => deriveLinkToken(`start-numbers:${eventId}:${eventClass}:${version}`, secret)

export const getStartNumberLinkToken = async (
  eventId: string,
  event: LinkVersionFields,
  eventClass: string
): Promise<string> =>
  deriveStartNumberLinkToken(
    eventId,
    eventClass,
    startNumberLinkVersion(event, eventClass),
    await getRegistrationEditTokenSecret()
  )

/**
 * The class a request's Bearer token opens, or a 404 that does not say why. A wrong token, a revoked
 * one and a class the trial does not run all read the same from outside, exactly as the post links
 * and the registration links behave.
 */
export const authorizeStartNumberLink = async (
  apiEvent: Pick<APIGatewayProxyEvent, 'headers'>,
  eventId: string,
  confirmedEvent: JsonConfirmedEvent,
  eventClass: string
): Promise<string> => {
  if (!startNumberLinkClasses(confirmedEvent).includes(eventClass)) throw new LambdaError(404, 'not found')

  const token = getBearerToken(apiEvent)
  if (!token) throw new LambdaError(404, 'not found')

  const expected = await getStartNumberLinkToken(eventId, confirmedEvent, eventClass)
  if (!linkTokensMatch(token, expected)) throw new LambdaError(404, 'not found')

  return eventClass
}

const runsInClass = (registration: JsonRegistration, eventClass: string) =>
  isScorableRegistration(registration) && getRegistrationClass(registration) === eventClass

/**
 * The numbers the class holds in the working order — the space its draw redistributes (KOE-1267).
 *
 * The working order numbers every participant of the trial in one run, day after day and class after
 * class (Friday 1–24, Saturday 25–48), so each class-day is a run of it. A class secretary draws
 * within the numbers their own class holds: which dog holds which changes, the set does not, and two
 * classes drawing at the same time can then never reach for the same number.
 */
export const classNumberSpace = (registrations: JsonRegistration[], eventClass: string): number[] =>
  registrations
    .filter((registration) => runsInClass(registration, eventClass))
    .map((registration) => registration.group?.number)
    .filter((number): number is number => number !== undefined)
    .sort((a, b) => a - b)

/**
 * What a class link may write: its own dogs, and only the numbers its class has in the working order.
 * Both refusals are the ticket's point — a class secretary must not reach into another class's sheet,
 * nor hand out a number that belongs to another class.
 */
export const assertEntriesInClassSpace = (
  registrations: JsonRegistration[],
  eventClass: string,
  entries: StartNumberEntry[]
): void => {
  const own = new Set(registrations.filter((reg) => runsInClass(reg, eventClass)).map((reg) => reg.id))
  const space = new Set(classNumberSpace(registrations, eventClass))

  for (const entry of entries) {
    if (!own.has(entry.id)) {
      throw new LambdaError(403, `Registration '${entry.id}' does not run in ${eventClass}`)
    }
    if (!space.has(entry.startNumber)) {
      throw new LambdaError(
        422,
        JSON.stringify({
          error: 'startNumberOutsideClass',
          message: `Start number ${entry.startNumber} is not one of ${eventClass}'s working order numbers`,
        })
      )
    }
  }
}

/** One dog as the draw needs it: the sheet the event secretary works from, for this class alone. */
const classStartNumberDog = (registration: JsonRegistration): JsonClassStartNumberDog => ({
  class: registration.class,
  dog: { name: registration.dog.name, regNo: registration.dog.regNo },
  eventType: registration.eventType,
  group: registration.group,
  handler: { name: registration.handler?.name },
  id: registration.id,
  ...(registration.startGroup ? { startGroup: registration.startGroup } : {}),
})

export const classStartNumbersResponse = (
  confirmedEvent: JsonConfirmedEvent,
  eventClass: string,
  registrations: JsonRegistration[]
): JsonClassStartNumbers => ({
  event: linkedEventProjection(confirmedEvent),
  eventClass,
  registrations: registrations
    .filter((registration) => runsInClass(registration, eventClass))
    .sort(sortRegistrationsByDateClassTimeAndNumber)
    .map(classStartNumberDog),
})
