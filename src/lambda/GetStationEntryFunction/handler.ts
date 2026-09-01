import type { JsonConfirmedEvent } from '../../types'
import { getEvent } from '../lib/event'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { authorizeStationEntry, stationEntryResponse } from '../lib/stationEntry'

/**
 * The station secretary's view, behind the station's own tokenized link rather than a login: the post,
 * its slice of the course, and a minimal projection of the dogs that run.
 */
const getStationEntryLambda = lambda('getStationEntry', async (event) => {
  const eventId = getParam(event, 'eventId')
  const stationId = getParam(event, 'stationId')

  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)
  const station = await authorizeStationEntry(event, eventId, confirmedEvent, stationId)
  const registrations = await getRegistrationsByEventId(eventId)

  return response(200, stationEntryResponse(confirmedEvent, station, registrations), event)
})

export default getStationEntryLambda
