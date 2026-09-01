import type {
  JsonConfirmedEvent,
  JsonRegistration,
  JsonStationTurn,
  StationTurnOp,
  StationTurnPause,
} from '../../types'
import { randomUUID } from 'node:crypto'
import { openTurn } from '../../lib/stationTurns'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { LambdaError } from './lambda'

const { eventTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

const PAUSES: readonly StationTurnPause[] = ['coffee', 'lunch', 'weather', 'other']

/** A whole entry never runs at once; more ids than this is a malformed request, not a walk-up. */
const MAX_TURN_DOGS = 10

export const parseStationTurnOp = (body: unknown): StationTurnOp => {
  if (typeof body !== 'object' || body === null) throw new LambdaError(422, 'no turn')
  const { type, registrationIds, pause } = body as {
    type?: unknown
    registrationIds?: unknown
    pause?: unknown
  }

  if (type === 'end') return { type }
  if (type === 'break') {
    const knownPause = PAUSES.find((code) => code === pause)
    if (!knownPause) throw new LambdaError(422, 'unknown pause')
    return { pause: knownPause, type }
  }
  if (type === 'start') {
    if (
      !Array.isArray(registrationIds) ||
      registrationIds.length === 0 ||
      registrationIds.length > MAX_TURN_DOGS ||
      !registrationIds.every((id) => typeof id === 'string')
    ) {
      throw new LambdaError(422, 'invalid turn dogs')
    }
    return { registrationIds, type }
  }
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
  now: Date = new Date()
): JsonStationTurn[] => {
  const at = now.toISOString()
  const closed = closeOpen(turns, stationId, at)

  if (op.type === 'end') {
    if (closed === turns) throw new LambdaError(422, 'nothing to end')
    return closed
  }

  if (op.type === 'break') {
    return [...closed, { dogs: [], id: randomUUID(), pause: op.pause, registrationIds: [], startedAt: at, stationId }]
  }

  const dogs = op.registrationIds.map((id) => {
    const registration = registrations.find((item) => item.id === id)
    if (!registration || registration.cancelled) throw new LambdaError(422, 'unknown dog')
    // The public face is frozen at the start of the turn, from the same placement the start list shows.
    const placement = registration.startGroup ?? registration.group
    return { name: registration.dog.name ?? '', ...(placement?.number ? { number: placement.number } : {}) }
  })

  return [...closed, { dogs, id: randomUUID(), registrationIds: op.registrationIds, startedAt: at, stationId }]
}

/**
 * Persist the new timeline, conditioned on the one it was derived from: two secretaries racing at one
 * post cannot silently drop each other's span. The caller re-reads and re-applies on a lost race.
 */
export const saveStationTurns = async (
  eventId: string,
  expected: JsonStationTurn[] | undefined,
  turns: JsonStationTurn[]
): Promise<void> => {
  const condition = expected
    ? { expression: '#turns = :expected', names: { '#turns': 'turns' }, values: { ':expected': expected } }
    : { expression: 'attribute_not_exists(#turns)', names: { '#turns': 'turns' } }

  await dynamoDB.update({ id: eventId }, { set: { turns } }, eventTable, undefined, condition)
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

  for (let attempt = 1; ; attempt++) {
    const turns = applyStationTurnOp(expected ?? [], registrations, stationId, op, now)
    try {
      await saveStationTurns(confirmedEvent.id, expected, turns)
      return turns
    } catch (error) {
      if (!isConditionalCheckFailed(error) || attempt >= TURN_WRITE_ATTEMPTS) throw error
      expected = await readStoredTurns(confirmedEvent.id)
    }
  }
}
