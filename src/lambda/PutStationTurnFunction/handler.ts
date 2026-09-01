import type { JsonConfirmedEvent } from '../../types'
import { IMPLICIT_STATION_ID } from '../../lib/stationTurns'
import { authorizeWithMemberOf } from '../lib/auth'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { parseStationTurnOp, writeStationTurn } from '../lib/stationTurns'
import { publishEventPatch } from '../lib/ws/actions'

/**
 * The event secretary's turn writes (KOE-1259): start a turn, start a break, end the open span. One
 * op per request — the live timeline advances one tap at a time, and the WebSocket carries the new
 * state to every admin and public viewer.
 */
const putStationTurnLambda = lambda('putStationTurn', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)
  if (res) return res

  const eventId = getParam(event, 'eventId')
  const body = parseJSONWithFallback<{ stationId?: unknown }>(event.body, {})
  const op = parseStationTurnOp(body)

  const confirmedEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, eventId)

  // A format without stations runs its one implicit post; with stations, the post must be real.
  const stationId = typeof body.stationId === 'string' && body.stationId ? body.stationId : IMPLICIT_STATION_ID
  if (confirmedEvent.stations?.length && !confirmedEvent.stations.some((station) => station.id === stationId)) {
    throw new LambdaError(404, 'not found')
  }

  const registrations = await getRegistrationsByEventId(eventId)
  const turns = await writeStationTurn(confirmedEvent, registrations, stationId, op)

  await publishEventPatch({ eventId, turns }, confirmedEvent.organizer.id)

  return response(200, { turns }, event)
})

export default putStationTurnLambda
