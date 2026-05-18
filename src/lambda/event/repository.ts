import type { JsonConfirmedEvent, JsonDogEvent, JsonRegistration } from '../../types'
import { addDays } from 'date-fns'
import { zonedStartOfDay } from '../../i18n/dates'
import { CONFIG } from '../config'
import { LambdaError } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

type EventEntryEndDates = Pick<JsonDogEvent, 'id' | 'entryEndDate' | 'entryOrigEndDate'>

export type EventRecord = JsonConfirmedEvent

export type EventPatchValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[]
  | number[]
  | boolean[]
  | object
  | Record<string, unknown>
  | Array<Record<string, unknown>>

/**
 * Canonical event patch payload for update-oriented saves.
 *
 * Repository-backed update flows should prefer [`EventRepository.patch()`](src/lambda/event/repository.ts:79)
 * over full entity replacement so the same patch can later drive persistence and outbound publication.
 * @todo improve the type contract of set
 */
export type EventPatch = {
  eventId: JsonConfirmedEvent['id']
  set?: Partial<Record<keyof JsonConfirmedEvent, EventPatchValue>>
  remove?: Array<keyof JsonConfirmedEvent>
}

export type EventAggregatePatch = Pick<EventPatch, 'eventId' | 'set'>

export type CreateEventInput = JsonConfirmedEvent

/**
 * Event repository contract for the refactored write slice.
 *
 * Create flows persist a full confirmed event through [`EventRepository.create()`](src/lambda/event/repository.ts:78).
 * Update-oriented save flows must prefer [`EventRepository.patch()`](src/lambda/event/repository.ts:79)
 * so patch semantics stay explicit and reusable by downstream publishers.
 */
export interface EventRepository {
  getById(eventId: JsonConfirmedEvent['id']): Promise<JsonConfirmedEvent | undefined>
  listAll(): Promise<JsonDogEvent[] | undefined>
  listAllConfirmed(): Promise<JsonConfirmedEvent[] | undefined>
  listAllRegistrations(): Promise<JsonRegistration[] | undefined>
  listBySeasonStartDateRange(input: { season: string; endDateIso: string }): Promise<JsonDogEvent[] | undefined>
  listBySeasonModifiedAfter(input: { season: string; modifiedAfterIso: string }): Promise<JsonDogEvent[] | undefined>
  updateInvitationAttachment(eventId: JsonConfirmedEvent['id'], invitationAttachment: string): Promise<void>
  create(input: CreateEventInput): Promise<JsonConfirmedEvent>
  save(input: JsonDogEvent): Promise<void>
  patch(eventPatch: EventPatch): Promise<JsonConfirmedEvent>
  patchAggregates(eventPatch: EventAggregatePatch): Promise<JsonConfirmedEvent>
  /** Finds the qualification period start date for the given event type and entry end date. */
  findQualificationStartDate(eventType: string, entryEndDate: string): Promise<string | undefined>
}

type EventRepositoryDependencies = {
  db: Pick<CustomDynamoClient, 'read' | 'readAll' | 'update' | 'write' | 'query'>
}

const eventTable = CONFIG.eventTable

const ensureUpdateOperations = (eventPatch: Pick<EventPatch, 'eventId' | 'set' | 'remove'>) => {
  if (!eventPatch.set && !eventPatch.remove?.length) {
    throw new Error('EventPatch must include set or remove operations')
  }
}

const readPatchedEvent = async (
  db: Pick<CustomDynamoClient, 'read'>,
  eventId: JsonConfirmedEvent['id']
): Promise<JsonConfirmedEvent> => {
  const item = await db.read<JsonConfirmedEvent>({ id: eventId }, eventTable)

  if (!item) {
    throw new LambdaError(404, `Event with id '${eventId}' was not found`)
  }

  return item
}

export const createEventRepository = ({ db }: EventRepositoryDependencies): EventRepository => ({
  async create(input) {
    await db.write(input, eventTable)
    return input
  },
  async findQualificationStartDate(eventType, entryEndDate) {
    const result = await db.query<EventEntryEndDates>({
      forward: false,
      index: 'gsiEventTypeEntryEndDate',
      key: 'eventType = :eventType AND entryEndDate < :entryEndDate',
      limit: 1,
      table: CONFIG.eventTable,
      values: { ':entryEndDate': entryEndDate, ':eventType': eventType },
    })
    if (result?.length === 1 && result[0]?.entryEndDate) {
      const date = new Date(result[0].entryOrigEndDate ?? result[0].entryEndDate)
      return zonedStartOfDay(addDays(date, 1)).toISOString()
    }
  },
  async getById(eventId) {
    return db.read<JsonConfirmedEvent>({ id: eventId }, eventTable)
  },
  async listAll() {
    return db.readAll<JsonDogEvent>(eventTable)
  },
  async listAllConfirmed() {
    return db.readAll<JsonConfirmedEvent>(eventTable)
  },
  async listAllRegistrations() {
    return db.readAll<JsonRegistration>(CONFIG.registrationTable)
  },
  async listBySeasonModifiedAfter({ modifiedAfterIso, season }) {
    return db.query<JsonDogEvent>({
      index: 'gsiSeasonModifiedAt',
      key: 'season = :season AND modifiedAt > :modifiedAfter',
      table: eventTable,
      values: { ':modifiedAfter': modifiedAfterIso, ':season': season },
    })
  },
  async listBySeasonStartDateRange({ endDateIso, season }) {
    return db.query<JsonDogEvent>({
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      table: eventTable,
      values: {
        ':endDate': endDateIso,
        ':season': season,
      },
    })
  },

  async patch(eventPatch) {
    ensureUpdateOperations(eventPatch)

    await db.update(
      { id: eventPatch.eventId },
      {
        ...(eventPatch.set ? { set: eventPatch.set } : {}),
        ...(eventPatch.remove?.length ? { remove: eventPatch.remove } : {}),
      },
      eventTable
    )

    return readPatchedEvent(db, eventPatch.eventId)
  },

  async patchAggregates(eventPatch) {
    if (!eventPatch.set) {
      throw new Error('Event aggregate patch must include set operations')
    }

    await db.update(
      { id: eventPatch.eventId },
      {
        set: eventPatch.set,
      },
      eventTable
    )

    return readPatchedEvent(db, eventPatch.eventId)
  },
  async save(input) {
    await db.write(input, eventTable)
  },
  async updateInvitationAttachment(eventId, invitationAttachment) {
    await db.update(
      { id: eventId },
      {
        set: {
          invitationAttachment,
        },
      },
      eventTable
    )
  },
})

const dynamoDB = new CustomDynamoClient(eventTable)

export const eventRepository = createEventRepository({ db: dynamoDB })
