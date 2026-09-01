import type { JsonConfirmedEvent } from '../../types'
import { getEvent } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { authorizeStationEntry, publicStationTurns } from '../lib/stationEntry'
import { parseStationTurnOp, writeStationTurn } from '../lib/stationTurns'
import { publishEventPatch } from '../lib/ws/actions'

/**
 * Turn writes from the station's tokenized link (KOE-1259): the same ops the event secretary has,
 * forced onto the path's own post — whatever the body claims, this link runs one post's timeline and
 * nothing more. The echo is the public turn shape, like everything else this link sees.
 */
const putStationEntryTurnLambda = lambda('putStationEntryTurn', async (event) => {
  const eventId = getParam(event, 'eventId')
  const stationId = getParam(event, 'stationId')

  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)
  const station = await authorizeStationEntry(event, eventId, confirmedEvent, stationId)
  const op = parseStationTurnOp(parseJSONWithFallback(event.body, {}))

  const registrations = await getRegistrationsByEventId(eventId)
  const turns = await writeStationTurn(confirmedEvent, registrations, station.id, op)

  await publishEventPatch({ eventId, turns }, confirmedEvent.organizer.id)

  return response(200, { turns: publicStationTurns(turns, station.id) }, event)
})

export default putStationEntryTurnLambda
