import type { DayKey } from './Day'
import type { EventState } from './Event'
import type { JsonRegistration } from './Registration'

interface OrganizerEventStats {
  organizerId: string
  eventId: string
  date: string
  count: number // total registrations
  reserveRegistrations: number
  cancelledRegistrations: number
  paidRegistrations: number
  refundedRegistrations: number
  /** Non-cancelled starters (not on the waiting list) whose owner or handler is a club member. */
  memberRegistrations: number
  paidAmount: number
  refundedAmount: number
  updatedAt: string
}

/** What the stats count of a registration: the full row, or the projection the rebuild reads. */
export type RegistrationStatsInput = Pick<
  JsonRegistration,
  'cancelled' | 'class' | 'eventId' | 'eventType' | 'group' | 'id' | 'ownerHandles' | 'paidAmount' | 'refundAmount'
> & {
  dog?: Pick<JsonRegistration['dog'], 'breedCode' | 'regNo'>
  handler?: Pick<NonNullable<JsonRegistration['handler']>, 'email' | 'membership'>
  owner?: Pick<NonNullable<JsonRegistration['owner']>, 'membership'>
  owners?: Pick<NonNullable<JsonRegistration['owners']>[number], 'membership'>[]
}

export type YearlyStatTypes = 'eventType' | 'dog' | 'breed' | 'handler' | 'dog#handler' | 'class' | 'event'

/**
 * The participation types whose per-entity breakdown (`STAT#<year>#<type>`) is stored and served.
 * The other types only ever contribute their distinct count to TOTALS: a row per dog, handler,
 * dog+handler pair and event was 88 % of the stats table and nothing read it. The rebuild writes
 * exactly these, and the API can only ask for these, so the two cannot drift apart.
 */
export const YEARLY_BREAKDOWN_TYPES = ['breed', 'eventType', 'class'] as const satisfies readonly YearlyStatTypes[]
export type YearlyBreakdownType = (typeof YEARLY_BREAKDOWN_TYPES)[number]

export interface YearlyTotalStat {
  year: number
  type: YearlyStatTypes
  count: number
}

/**
 * Dog+handler pairs of a year split by whether they also competed the year before. Absent for
 * the earliest year on record, where "new" would only mean "this is where the data begins".
 */
export interface RetentionStats {
  year: number
  new: number
  returning: number
}

export interface YearlyBreakdownEntry {
  entityId: string
  count: number
}

// DynamoDB item / wire shape for the unified table (dates as ISO strings)
export interface JsonEventStatsItem extends Partial<OrganizerEventStats> {
  PK: string
  SK: string
  count?: number
}

// Frontend domain shape: `date` is the event's start, made a `Date` at the typed boundary (`lib/wire.ts`)
export type EventStatsItem = JsonEventStatsItem

/**
 * Sentinel `eventType` value for the public capacity endpoint: aggregates every active event
 * type server-side instead of one specific type. A single type's places are set by competition
 * rules, so its registrations-per-event figure mostly just reflects the rule rather than demand;
 * summing across types before computing a rate is what makes the rate meaningful.
 */
export const ALL_EVENT_TYPES_FOR_CAPACITY = 'ALL'

/**
 * Monthly available-places-vs-actual-starters aggregate for one event type + class,
 * used to gauge audience demand when planning future events.
 */
export interface CapacityStatsEntry {
  month: string // yyyy-mm
  eventType: string
  class: string // RegistrationClass, or eventType for classless event types
  organizerId: string
  places: number
  starters: number
  reserve: number
  cancelledRegistrations: number
  eventCount: number
}

// DynamoDB item / wire shape: PK = CAPACITY#{eventType}, SK = {yyyy-mm}#{class}#{organizerId}
export interface JsonCapacityStatsItem {
  PK: string
  SK: string
  organizerId: string
  places: number
  starters: number
  reserve: number
  cancelledRegistrations: number
  eventCount: number
  updatedAt: string
}

/**
 * Starters vs. reserve for one breed in one year: what share of that breed's non-cancelled
 * entries actually got a starting position. Cancelled registrations are excluded entirely.
 */
export interface BreedStartRateEntry {
  entityId: string
  starters: number
  reserve: number
}

// DynamoDB item / wire shape: PK = STAT#{year}#breedStart, SK = breed code
export interface JsonBreedStartStatsItem {
  PK: string
  SK: string
  starters: number
  reserve: number
  updatedAt: string
}

/**
 * How many events a judge officiates in one year, keyed by judge id (or name, for judges
 * without one): `held` the events that have ended by the nightly rebuild, `upcoming` the rest.
 * Summed over whichever organizers the query covered: an event has exactly one organizer, so
 * per-organizer counts add up without double-counting.
 */
export interface JudgeWorkloadEntry {
  judgeId: string
  name: string
  held: number
  upcoming: number
}

// DynamoDB item / wire shape: PK = JUDGE#{year}, SK = {organizerId}#{judgeId} (unique, not parsed
// back: the parts are stored as attributes so the organizer filter and the judge key need no
// splitting on a name that may itself contain '#').
export interface JsonJudgeWorkloadItem {
  PK: string
  SK: string
  organizerId: string
  judgeId: string
  name: string
  held: number
  upcoming: number
  updatedAt: string
}

/**
 * Sentinel `organizerId` value for a cross-club total row in the event breakdown -- mirrors
 * `ALL_EVENT_TYPES_FOR_CAPACITY` for the organizer axis.
 */
export const ALL_ORGANIZERS_FOR_EVENTS = 'ALL'

/**
 * Events organized by one club, their starting places, starts and distinct participating
 * handlers for one year + event type. `eventType` is `ALL_EVENT_TYPES_FOR_CAPACITY` for a club's
 * cross-type subtotal, and `organizerId` is `ALL_ORGANIZERS_FOR_EVENTS` for the nationwide grand
 * total (itself only meaningful combined with `eventType === ALL_EVENT_TYPES_FOR_CAPACITY`).
 * `handlerCount` is deduplicated within whatever this entry aggregates -- summing narrower
 * entries would double-count a handler who competed for the same club in more than one event
 * type, or for more than one club, the same year.
 */
export interface EventBreakdownEntry {
  organizerId: string
  eventType: string
  eventCount: number
  places: number
  starters: number
  handlerCount: number
  /** On the waiting list: not cancelled, and not placed in a participant (starting) group. */
  reserve?: number
  cancelledRegistrations?: number
  /** Of `starters`, how many had an owner or handler who was a club member. */
  memberStarters?: number
}

// DynamoDB item / wire shape: PK = BREAKDOWN#{year}, SK = {organizerId}#{eventType} (unique, not parsed back)
export interface JsonEventBreakdownItem {
  PK: string
  SK: string
  organizerId: string
  eventType: string
  eventCount: number
  places: number
  starters: number
  handlerCount: number
  reserve?: number
  cancelledRegistrations?: number
  memberStarters?: number
  updatedAt: string
}

/**
 * One class of one trial, for the export the judges' committee asked for (KOE-1595): the trial's own
 * fields and the class's figures, aggregates only. A class held on several days is one row listing
 * them: an entry names the class, not the day. A classless trial is one row with `class` ''.
 * Worked out from the events and registrations on request, never stored.
 */
export interface EventClassStatsRow {
  organizerId: string
  location: string
  startDate: DayKey
  endDate: DayKey
  eventType: string
  state: EventState
  entryStartDate?: DayKey
  entryEndDate?: DayKey
  priority: string[]
  /** The normal entry fee; early bird, breed and custom prices are not in the export. */
  cost: number
  costMember?: number
  class: string
  days: DayKey[]
  places: number
  /** Finished entries, also those cancelled later. */
  entries: number
  cancelled: number
  priorityEntries: number
  /** Dogs on the reserve list when it was notified that now start, or were picked and cancelled. */
  pickedFromReserve: number
  paidAmount: number
  refundedAmount: number
}
