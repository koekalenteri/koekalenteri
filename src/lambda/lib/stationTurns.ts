import type { LivePhase } from '../../lib/liveFormat'
import type {
  JsonConfirmedEvent,
  JsonRegistration,
  JsonStationTurn,
  LiveMark,
  StationTurnOp,
  StationTurnPause,
} from '../../types'
import { randomUUID } from 'node:crypto'
import { MAX_DOGS_AT_ONCE, resolveStation, stationPhases } from '../../lib/liveFormat'
import { openTurn } from '../../lib/stationTurns'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { LambdaError } from './lambda'

const { eventTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

const PAUSES: readonly StationTurnPause[] = ['coffee', 'lunch', 'weather', 'other']
const MARKS: readonly LiveMark[] = ['onRetrieve', 'gotRetrieve', 'noRetrieve', 'eyeWipe', 'firstDogDown']

/** A phase is a key or a label somebody typed; longer than this is not a phase. */
const MAX_PHASE_LENGTH = 40

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

/**
 * An empty group is allowed only with a phase, since a whole-entry phase is the one span that holds
 * no dogs; whether that phase actually is one is the apply step's to check, which knows the post.
 */
const parseStart = (registrationIds: unknown, phase: unknown): StationTurnOp => {
  if (!isStringArray(registrationIds) || registrationIds.length > MAX_DOGS_AT_ONCE) {
    throw new LambdaError(422, 'invalid turn dogs')
  }

  if (phase === undefined) {
    if (registrationIds.length === 0) throw new LambdaError(422, 'invalid turn dogs')
    return { registrationIds, type: 'start' }
  }

  if (typeof phase !== 'string' || phase.length === 0 || phase.length > MAX_PHASE_LENGTH) {
    throw new LambdaError(422, 'invalid phase')
  }
  return { phase, registrationIds, type: 'start' }
}

const parseMark = (index: unknown, mark: unknown): StationTurnOp => {
  const knownMark = MARKS.find((code) => code === mark)
  if (!knownMark) throw new LambdaError(422, 'unknown mark')
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= MAX_DOGS_AT_ONCE) {
    throw new LambdaError(422, 'invalid mark target')
  }
  return { index, mark: knownMark, type: 'mark' }
}

export const parseStationTurnOp = (body: unknown): StationTurnOp => {
  if (typeof body !== 'object' || body === null) throw new LambdaError(422, 'no turn')
  const { type, registrationIds, pause, phase, index, mark } = body as {
    type?: unknown
    registrationIds?: unknown
    pause?: unknown
    phase?: unknown
    index?: unknown
    mark?: unknown
  }

  if (type === 'end') return { type }
  if (type === 'break') {
    const knownPause = PAUSES.find((code) => code === pause)
    if (!knownPause) throw new LambdaError(422, 'unknown pause')
    return { pause: knownPause, type }
  }
  if (type === 'start') return parseStart(registrationIds, phase)
  if (type === 'mark') return parseMark(index, mark)

  throw new LambdaError(422, 'unknown turn op')
}

const closeOpen = (turns: JsonStationTurn[], stationId: string, endedAt: string): JsonStationTurn[] => {
  const open = openTurn(turns, stationId)
  if (!open) return turns
  return turns.map((turn) => (turn === open ? { ...turn, endedAt } : turn))
}

/**
 * Apply one op to the stored timeline and return the new one. Pure over its inputs so a conditional
 * write that loses its race can simply re-read and re-apply.
 */
export const applyStationTurnOp = (
  turns: JsonStationTurn[],
  registrations: JsonRegistration[],
  stationId: string,
  op: StationTurnOp,
  now: Date = new Date(),
  phases: readonly LivePhase[] = []
): JsonStationTurn[] => {
  const at = now.toISOString()

  // Marking edits the span that is running rather than ending it: at a NOME-A post all four dogs are
  // out on the same retrieve, and what each of them did comes in while the turn is still open.
  if (op.type === 'mark') {
    const open = openTurn(turns, stationId)
    if (!open?.dogs[op.index]) throw new LambdaError(422, 'nothing to mark')

    const dogs = open.dogs.map((dog, index) => (index === op.index ? { ...dog, mark: op.mark } : dog))
    return turns.map((turn) => (turn === open ? { ...turn, dogs } : turn))
  }

  const closed = closeOpen(turns, stationId, at)

  if (op.type === 'end') {
    if (closed === turns) throw new LambdaError(422, 'nothing to end')
    return closed
  }

  if (op.type === 'break') {
    return [...closed, { dogs: [], id: randomUUID(), pause: op.pause, registrationIds: [], startedAt: at, stationId }]
  }

  // A phase is one the post has; a whole-entry phase holds no dogs, every other one holds some.
  const phase = op.phase === undefined ? undefined : phases.find((item) => item.key === op.phase)
  if (op.phase !== undefined && !phase) throw new LambdaError(422, 'unknown phase')
  if (Boolean(phase?.whole) !== (op.registrationIds.length === 0)) throw new LambdaError(422, 'invalid turn dogs')

  const dogs = op.registrationIds.map((id) => {
    const registration = registrations.find((item) => item.id === id)
    if (!registration || registration.cancelled) throw new LambdaError(422, 'unknown dog')
    // The public face is frozen at the start of the turn, from the same placement the start list shows.
    const placement = registration.startGroup ?? registration.group
    return { name: registration.dog.name ?? '', ...(placement?.number ? { number: placement.number } : {}) }
  })

  return [
    ...closed,
    {
      dogs,
      id: randomUUID(),
      registrationIds: op.registrationIds,
      startedAt: at,
      stationId,
      ...(op.phase === undefined ? {} : { phase: op.phase }),
    },
  ]
}

/**
 * Persist the new timeline, conditioned on the one it was derived from: two secretaries racing at one
 * post cannot silently drop each other's span. The caller re-reads and re-applies on a lost race.
 */
export const saveStationTurns = async (
  eventId: string,
  expected: JsonStationTurn[] | undefined,
  turns: JsonStationTurn[],
  now: Date = new Date()
): Promise<void> => {
  const condition = expected
    ? { expression: '#turns = :expected', names: { '#turns': 'turns' }, values: { ':expected': expected } }
    : { expression: 'attribute_not_exists(#turns)', names: { '#turns': 'turns' } }

  // `updatedAt` moves so an incremental fetch of the calendar carries the new timeline; `modifiedAt`
  // stays, because a turn is the day happening, not an edit to the event.
  await dynamoDB.update(
    { id: eventId },
    { set: { turns, updatedAt: now.toISOString() } },
    eventTable,
    undefined,
    condition
  )
}

const isConditionalCheckFailed = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { name?: string }).name === 'ConditionalCheckFailedException'

const readStoredTurns = async (eventId: string): Promise<JsonStationTurn[] | undefined> => {
  const stored = await dynamoDB.read<JsonConfirmedEvent>({ id: eventId }, eventTable)
  return stored?.turns
}

const TURN_WRITE_ATTEMPTS = 3

/**
 * The whole write path: apply the op to the freshest timeline and store it, retrying a lost race with
 * a re-read — the content-comparison shape the results write path settled, without inventing a lock.
 */
export const writeStationTurn = async (
  confirmedEvent: JsonConfirmedEvent,
  registrations: JsonRegistration[],
  stationId: string,
  op: StationTurnOp,
  now: Date = new Date()
): Promise<JsonStationTurn[]> => {
  let expected = confirmedEvent.turns
  const phases = stationPhases(confirmedEvent.eventType, resolveStation(confirmedEvent, stationId))

  for (let attempt = 1; ; attempt++) {
    const turns = applyStationTurnOp(expected ?? [], registrations, stationId, op, now, phases)
    try {
      await saveStationTurns(confirmedEvent.id, expected, turns, now)
      return turns
    } catch (error) {
      if (!isConditionalCheckFailed(error) || attempt >= TURN_WRITE_ATTEMPTS) throw error
      expected = await readStoredTurns(confirmedEvent.id)
    }
  }
}
