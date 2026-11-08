import { integer, literal, maxValue, minValue, optional, pipe, union } from 'valibot'
import { OFFICIAL_FORMATS } from '../../types'
import { MAX_DOGS_AT_ONCE } from '../liveFormat'
import { arrayOf, bool, maybe, num, objectOf, oneOf, str } from './common'

const cost = union([num, objectOf({})], 'must be a number or an object')

const count = pipe(num, integer('must be an integer'), minValue(1, 'must be at least 1'))
/** An exercise whole or in two parts (KOE-1665). */
const parts = union([literal(1), literal(2)], 'must be 1 or 2')

/** A post's own layout; the rest of a post is the posts page's to shape. */
const station = objectOf({ parts: optional(parts) })

/** A walk-up, at most what the posts page offers. */
const dogsAtOnce = pipe(count, maxValue(MAX_DOGS_AT_ONCE, `must be at most ${MAX_DOGS_AT_ONCE}`))

/** One exercise of a group's running order (KOE-1665). */
const exercise = objectOf({
  dogsAtOnce: optional(dogsAtOnce),
  parts: optional(parts),
  stationId: str,
})

/**
 * A group with its running order. Whether its range is whole, what its exercises name and whether two
 * groups share a number is checked against the merged event (`rotationShapeErrors`). A `posts` key of
 * a group stored in dev before the running order is not refused here: the object is loose.
 */
const rotationGroup = objectOf({
  class: str,
  exercises: arrayOf(exercise),
  firstNumber: optional(count),
  lastNumber: optional(count),
})

/**
 * A team of a team competition (KOE-1714). That a dog is in one team only, and that a team has a letter
 * for every dog, is checked on the merged event (`teamErrors`).
 */
const team = objectOf({
  name: optional(str),
  registrationIds: arrayOf(str),
})

/**
 * The shape of an event body on the wire, read the same partial, non-stripping way as
 * `registrationBodySchema`: one endpoint serves create, update and PATCH, so every field is optional.
 *
 * The semantic checks stay in the handler, where the stored event is known — that `startDate` falls in
 * a season, that the caller may touch this organizer's events, that a deletion is allowed. This says
 * only that a field the client did send is the kind of thing it claims to be.
 */
export const eventBodySchema = objectOf({
  classes: maybe(arrayOf(objectOf({ class: maybe(str), date: maybe(str) }))),
  contactInfo: maybe(objectOf({})),
  cost: maybe(cost),
  costMember: maybe(cost),
  dates: maybe(arrayOf(objectOf({ date: maybe(str), time: maybe(oneOf(['ap', 'ip', 'kp'])) }))),
  deletedAt: maybe(str),
  description: maybe(str),
  endDate: maybe(str),
  entries: maybe(num),
  entryEndDate: maybe(str),
  entryStartDate: maybe(str),
  eventType: maybe(str),
  headquarters: maybe(objectOf({})),
  id: maybe(str),
  judges: maybe(arrayOf(objectOf({ id: maybe(num), name: maybe(str) }))),
  /** Cleared by sending an explicit null, like kcId (KOE-1534). */
  kcGuid: maybe(str),
  /** Cleared by sending an explicit null, which the handler reads as "no Kennel Club id". */
  kcId: maybe(num),
  location: maybe(str),
  members: maybe(num),
  mockTrial: maybe(bool),
  modifiedAt: maybe(str),
  name: maybe(str),
  official: maybe(objectOf({})),
  /** One of the four official types, or an explicit null that stops following one (KOE-1718). */
  officialFormat: maybe(oneOf(OFFICIAL_FORMATS)),
  organizer: maybe(objectOf({ id: maybe(str), name: maybe(str) })),
  paymentTime: maybe(oneOf(['registration', 'confirmation'])),
  places: maybe(num),
  placesPerDay: maybe(objectOf({})),
  priority: maybe(arrayOf(str)),
  qualificationStartDate: maybe(str),
  restrictions: maybe(arrayOf(str)),
  retrieveType: maybe(oneOf(['game', 'dummies'])),
  rotations: maybe(arrayOf(rotationGroup)),
  secretary: maybe(objectOf({})),
  startDate: maybe(str),
  state: maybe(
    oneOf(['draft', 'tentative', 'cancelled', 'confirmed', 'picked', 'invited', 'started', 'ended', 'completed'])
  ),
  stations: maybe(arrayOf(station)),
  teams: maybe(arrayOf(team)),
})
