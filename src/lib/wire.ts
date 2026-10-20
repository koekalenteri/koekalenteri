import type {
  AuditRecord,
  ClassStartNumberDog,
  ClassStartNumbers,
  CollectionResponse,
  DayKey,
  Dog,
  DogEvent,
  EmailTemplate,
  EventClass,
  EventKcIdChoice,
  EventResult,
  EventResultConflict,
  EventResultsResponse,
  EventResultTask,
  EventStation,
  EventStatsItem,
  EventType,
  InvitationAttachmentVersion,
  JsonAuditRecord,
  JsonClassStartNumberDog,
  JsonClassStartNumbers,
  JsonDog,
  JsonDogEvent,
  JsonEmailTemplate,
  JsonEventClass,
  JsonEventKcIdChoice,
  JsonEventResult,
  JsonEventResultConflict,
  JsonEventResultsResponse,
  JsonEventResultTask,
  JsonEventStation,
  JsonEventStatsItem,
  JsonEventType,
  JsonInvitationAttachmentVersion,
  JsonKcEventInfo,
  JsonKcResult,
  JsonKcState,
  JsonLastEmail,
  JsonLinkedEvent,
  JsonManualTestResult,
  JsonPublicDogEvent,
  JsonPublicRegistration,
  JsonPublicRegistrationGroup,
  JsonPublicStationTurn,
  JsonQualifyingResult,
  JsonRegistration,
  JsonRegistrationDate,
  JsonRegistrationGroup,
  JsonStartNumberPatch,
  JsonStationEntry,
  JsonStationEntryDog,
  JsonStationTurn,
  JsonStationTurnPhase,
  JsonStoredEventResult,
  JsonTestResult,
  JsonTransaction,
  JsonUser,
  KcEventInfo,
  KcResult,
  KcState,
  LastEmail,
  LinkedEvent,
  ManualTestResult,
  Patch,
  PublicDogEvent,
  PublicRegistration,
  PublicRegistrationGroup,
  PublicStationTurn,
  QualifyingResult,
  Registration,
  RegistrationDate,
  RegistrationGroup,
  StartNumberPatch,
  StationEntry,
  StationEntryDog,
  StationTurn,
  StationTurnPhase,
  StoredEventResult,
  TestResult,
  Transaction,
  User,
} from '../types'
import { calendarDayOf, legacyStoredEventDay, localCalendarDayOf, TIME_ZONE } from './day'

/**
 * The boundary between what crosses the wire (an API response, a WebSocket message, a value read
 * back from browser storage) and the browser model (KOE-1546). On the wire every instant and every
 * day is a string; in the model the named instants are `Date`s and the days day keys, each read by
 * its rule (KOE-1547). A converter per type makes them so,
 * from the field's name, never from what a value looks like: a cancellation reason the entrant typed
 * as "2024-05-01" stays the text it is.
 *
 * Which fields a converter must name is checked by the compiler: `Spec` lists every key of the model
 * whose type holds a `Date` anywhere, so a converter that forgets one does not compile, and the wire
 * type must hold no `Date` at all, so a model type cannot pose as its own wire shape.
 */

/** `true` when a value of this type holds a `Date` anywhere inside it. */
export type HoldsDate<T> = T extends Date
  ? true
  : T extends readonly (infer U)[]
    ? HoldsDate<U>
    : T extends (...args: never[]) => unknown
      ? false
      : T extends object
        ? true extends { [K in keyof T]-?: HoldsDate<NonNullable<T[K]>> }[keyof T]
          ? true
          : false
        : false

/** The keys of the model whose type holds a `Date`: the ones a converter has to name. */
type DateKeys<M> = { [K in keyof M]-?: true extends HoldsDate<NonNullable<M[K]>> ? K : never }[keyof M]

/** What a converter does to one field: the wire value in, the model value out. */
type Rule<JV, MV> = (value: JV) => MV

/**
 * A converter's field list: one rule for every key of the model that holds a `Date`, typed from the
 * wire value to the model value. A key missing from the list is a type error. Another key may have a
 * rule too, typed the same way, where the model reads its wire value differently: a dog's dates are
 * day keys read from the forms they were stored in (KOE-1548), and may read as none.
 */
type Spec<J extends object, M extends object> = {
  [K in DateKeys<M>]-?: K extends keyof J ? Rule<NonNullable<J[K]>, NonNullable<M[K]>> : never
} & { [K in Exclude<keyof M, DateKeys<M>>]?: K extends keyof J ? Rule<NonNullable<J[K]>, M[K]> : never }

/** A spec is only accepted for a wire type that holds no `Date`: a model type cannot stand in for one. */
type WireSpec<J extends object, M extends object> = true extends HoldsDate<J> ? never : Spec<J, M>

/** A key the spec names that the model does not have, whether written out or spread in. */
type StrayKeys<S, M> = { [K in Exclude<keyof S, keyof M>]: never }

/**
 * The converter a value read back from browser storage needs: required when the model holds a `Date`,
 * which the JSON holds as a string, and not there when it does not, since such a model is its own JSON.
 */
export type ReviveOption<T, J> = true extends HoldsDate<T> ? { revive: (stored: J) => T } : { revive?: never }

/**
 * What a converter answers an input with: the model for the whole wire shape, else the same partial
 * or patch of it. An untyped input (a parsed WebSocket message) is taken for the whole shape.
 */
type Converted<I, J, M extends object> = 0 extends 1 & I
  ? M
  : I extends J
    ? M
    : I extends Partial<J>
      ? Partial<M>
      : Patch<M>

/**
 * A converter from the wire shape to the model, and from a partial or a patch of the wire shape to
 * the same partial or patch of the model: only the fields present are converted.
 */
type Converter<J extends object, M extends object> = <I extends Patch<J>>(json: I) => Converted<I, J, M>

type LooseRule = (value: unknown) => unknown

/**
 * A field is converted when it is there: an explicit `undefined` stays absent, and `null` stays
 * `null`, because a patch deletes a field with it and a response may answer a field with it.
 */
const isPresent = (value: unknown): boolean => value !== undefined && value !== null

/** An ISO instant as a `Date`. */
export const timestamp = (value: string): Date => new Date(value)

/**
 * An event's or an entry's day as the browser's model holds it: the day key the server sends
 * (KOE-1547). A row not yet migrated sends the instant it holds, and a cache or a draft this browser
 * stored before holds the Finnish midnight or end of day it was given: each is read as the day the
 * migration writes for it (`legacyStoredEventDay`), so the key a save sends back is that day, an hour-off
 * row's included. A value with no day stays as it came, and the readers take it for none.
 */
const eventDay = <T extends string>(value: T): DayKey | T => legacyStoredEventDay(value, TIME_ZONE) ?? value

/**
 * `converter<J, M>()(spec)`: the wire and model types first, the spec in a call of its own, so that
 * the spec's own keys are seen (a stray key spread in from a shared rule set is an error too).
 */
export const converter =
  <J extends object, M extends object>() =>
  <S extends WireSpec<J, M>>(spec: S & StrayKeys<S, M>): Converter<J, M> => {
    // Every rule was typed against its own field where the spec was written; here each is applied to
    // whatever the server sent under that name, which the compiler cannot relate back to the rule.
    const rules = Object.entries(spec) as Array<[string, LooseRule]>

    function convert<I extends Patch<J>>(json: I): Converted<I, J, M>
    function convert(json: object): object {
      const result: Record<string, unknown> = { ...json }
      for (const [key, rule] of rules) {
        const value = result[key]
        if (isPresent(value)) result[key] = rule(value)
      }
      return result
    }

    return convert
  }

/** The rule for a list: each element converted, a `null` or missing element left as it is. */
export const arrayOf =
  <J extends object, M extends object>(convert: (value: J) => M) =>
  (values: readonly J[]): M[] =>
    values.map((value) => (value === null || value === undefined ? value : convert(value)))

/** The rule for a map: each entry converted, a `null` entry left as it is. */
export const recordOf =
  <J extends object, M extends object>(convert: (value: J) => M) =>
  (values: Readonly<Record<string, J>>): Record<string, M> =>
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        value === null || value === undefined ? value : convert(value),
      ])
    )

/** A collection response, full or incremental, with every item converted. */
export const toCollection = <J, M>(response: CollectionResponse<J>, convert: (item: J) => M): CollectionResponse<M> =>
  Array.isArray(response) ? response.map(convert) : { ...response, items: response.items.map(convert) }

/*
 * The converters, one per type the browser holds.
 */

const dbRecordRules = {
  createdAt: timestamp,
  deletedAt: timestamp,
  modifiedAt: timestamp,
  updatedAt: timestamp,
}

export const toUser = converter<JsonUser, User>()({ ...dbRecordRules, lastSeen: timestamp })

export const toEmailTemplate = converter<JsonEmailTemplate, EmailTemplate>()(dbRecordRules)

export const toEventType = converter<JsonEventType, EventType>()(dbRecordRules)

export const toTransaction = converter<JsonTransaction, Transaction>()({ createdAt: timestamp, statusAt: timestamp })

export const toAuditRecord = converter<JsonAuditRecord, AuditRecord>()({ timestamp })

export const toEventStatsItem = converter<JsonEventStatsItem, EventStatsItem>()({ date: eventDay })

const toRegistrationDate = converter<JsonRegistrationDate, RegistrationDate>()({ date: eventDay })

const toRegistrationGroup = converter<JsonRegistrationGroup, RegistrationGroup>()({ date: eventDay })

const toPublicRegistrationGroup = converter<JsonPublicRegistrationGroup, PublicRegistrationGroup>()({
  date: eventDay,
})

const toEventResultTask = converter<JsonEventResultTask, EventResultTask>()({ updatedAt: timestamp })

const toEventResult = converter<JsonEventResult, EventResult>()({
  tasks: arrayOf(toEventResultTask),
  updatedAt: timestamp,
})

const toLastEmail = converter<JsonLastEmail, LastEmail>()({ sentAt: timestamp })

/** `day` is a day key and stays the string it is (KOE-1140). */
export const toKcResult = converter<JsonKcResult, KcResult>()({ at: timestamp })

/** How a stored dog date (a day key, a zone-less stamp, an instant) is read as a day. */
type CalendarDayRule = (value: string) => DayKey | undefined

/**
 * The converters that hold a dog's dates, built on one reading of them (KOE-1548). The birth date and a
 * result's date are calendar days: a key, Kennelliitto's stamp without a zone, or an instant written
 * before they were keys. What the server sends reads an instant as its Finnish day, as the lambdas
 * decide on it; what this browser stored reads it as its local day, the day its picker showed.
 */
const dogDateConverters = (calendarDay: CalendarDayRule) => {
  const toTestResult = converter<JsonTestResult, TestResult>()({ date: calendarDay })
  const toQualifyingResult = converter<JsonQualifyingResult, QualifyingResult>()({ date: calendarDay })
  const toManualTestResult = converter<JsonManualTestResult, ManualTestResult>()({ date: calendarDay })
  const toDog = converter<JsonDog, Dog>()({
    dob: calendarDay,
    refreshDate: timestamp,
    results: arrayOf(toTestResult),
  })
  const toRegistration = converter<JsonRegistration, Registration>()({
    ...dbRecordRules,
    dates: arrayOf(toRegistrationDate),
    dog: toDog,
    eventResult: toEventResult,
    group: toRegistrationGroup,
    invitationAttachmentUpdatedAt: timestamp,
    kcResult: toKcResult,
    // A message recorded before KOE-1454 is a finished sentence, kept as it was written.
    lastEmail: (value) => (typeof value === 'string' ? value : toLastEmail(value)),
    paidAt: timestamp,
    qualifyingResults: arrayOf(toQualifyingResult),
    refundAt: timestamp,
    results: arrayOf(toManualTestResult),
    startGroup: toRegistrationGroup,
  })
  const toPublicRegistration = converter<JsonPublicRegistration, PublicRegistration>()({
    dog: toDog,
    group: toPublicRegistrationGroup,
  })
  return { toDog, toManualTestResult, toPublicRegistration, toRegistration }
}

/** The dog's dates as the server sends them. */
export const { toDog, toManualTestResult, toPublicRegistration, toRegistration } = dogDateConverters((value) =>
  calendarDayOf(value, TIME_ZONE)
)

/**
 * The same shapes as this browser stored them (a draft, the dog cache): an instant there is a picker's
 * local midnight, and its day is the one the picker showed.
 */
export const {
  toDog: toStoredDog,
  toManualTestResult: toStoredManualTestResult,
  toRegistration: toStoredRegistration,
} = dogDateConverters(localCalendarDayOf)

export const toEventClass = converter<JsonEventClass, EventClass>()({ date: eventDay })

const toEventStation = converter<JsonEventStation, EventStation>()({ date: eventDay })

const toKcEventInfo = converter<JsonKcEventInfo, KcEventInfo>()({ endDate: eventDay, startDate: eventDay })

const toKcState = converter<JsonKcState, KcState>()({ readAt: timestamp })

export const toInvitationAttachmentVersion = converter<JsonInvitationAttachmentVersion, InvitationAttachmentVersion>()({
  uploadedAt: timestamp,
})

const toStationTurnPhase = converter<JsonStationTurnPhase, StationTurnPhase>()({ startedAt: timestamp })

const turnRules = { endedAt: timestamp, phases: arrayOf(toStationTurnPhase), startedAt: timestamp }

export const toStationTurn = converter<JsonStationTurn, StationTurn>()(turnRules)

export const toPublicStationTurn = converter<JsonPublicStationTurn, PublicStationTurn>()(turnRules)

/** The days of an event: day keys on the wire and in the model (KOE-1547). */
const eventDayRules = {
  classes: arrayOf(toEventClass),
  dates: arrayOf(toRegistrationDate),
  endDate: eventDay,
  entryEndDate: eventDay,
  entryOrigEndDate: eventDay,
  entryStartDate: eventDay,
  qualificationStartDate: eventDay,
  startDate: eventDay,
  stations: arrayOf(toEventStation),
}

const dogEventRules = {
  ...dbRecordRules,
  ...eventDayRules,
  invitationAttachmentHistory: recordOf(toInvitationAttachmentVersion),
  kcEvent: toKcEventInfo,
  kcState: toKcState,
  official: toUser,
  secretary: toUser,
  turns: arrayOf(toStationTurn),
}

export const toDogEvent = converter<JsonDogEvent, DogEvent>()(dogEventRules)

/** The admin event as the public event route serves it: with the derived `liveTurns` riding along. */
export const toDogEventWithLiveTurns = converter<
  JsonDogEvent & Pick<JsonPublicDogEvent, 'liveTurns'>,
  DogEvent & Pick<PublicDogEvent, 'liveTurns'>
>()({ ...dogEventRules, liveTurns: arrayOf(toPublicStationTurn) })

export const toPublicDogEvent = converter<JsonPublicDogEvent, PublicDogEvent>()({
  createdAt: timestamp,
  modifiedAt: timestamp,
  updatedAt: timestamp,
  ...eventDayRules,
  liveTurns: arrayOf(toPublicStationTurn),
})

const toLinkedEvent = converter<JsonLinkedEvent, LinkedEvent>()({
  classes: arrayOf(toEventClass),
  endDate: eventDay,
  startDate: eventDay,
})

const toStationEntryDog = converter<JsonStationEntryDog, StationEntryDog>()({
  eventResult: toEventResult,
  group: toRegistrationGroup,
})

export const toStationEntry = converter<JsonStationEntry, StationEntry>()({
  event: toLinkedEvent,
  registrations: arrayOf(toStationEntryDog),
  station: toEventStation,
  turns: arrayOf(toPublicStationTurn),
})

const toClassStartNumberDog = converter<JsonClassStartNumberDog, ClassStartNumberDog>()({
  group: toRegistrationGroup,
  startGroup: toRegistrationGroup,
})

export const toClassStartNumbers = converter<JsonClassStartNumbers, ClassStartNumbers>()({
  event: toLinkedEvent,
  registrations: arrayOf(toClassStartNumberDog),
})

export const toStartNumberPatch = converter<JsonStartNumberPatch, StartNumberPatch>()({
  startGroup: toRegistrationGroup,
})

export const toEventKcIdChoice = converter<JsonEventKcIdChoice, EventKcIdChoice>()({
  endDate: eventDay,
  entryEndDate: eventDay,
  entryStartDate: eventDay,
  startDate: eventDay,
})

const toStoredEventResult = converter<JsonStoredEventResult, StoredEventResult>()({ eventResult: toEventResult })

const toEventResultConflict = converter<JsonEventResultConflict, EventResultConflict>()({
  stored: toEventResult,
  submitted: toEventResult,
})

export const toEventResultsResponse = converter<JsonEventResultsResponse, EventResultsResponse>()({
  conflicts: arrayOf(toEventResultConflict),
  saved: arrayOf(toStoredEventResult),
  unchanged: arrayOf(toStoredEventResult),
})
