import type { JsonConfirmedEvent } from '../../types'
import { getLiveEvent } from '../lib/event'
import { getParam, lambda, response } from '../lib/lambda'
import { readEventRegistrations } from '../lib/repositories/registrationRepository'
import { authorizeStationEntry, stationEntryResponse } from '../lib/stationEntry'

/**
 * Live entry, the judge's secretary's view, behind the post's own tokenized link rather than a login: the post,
 * its slice of the course, and a minimal projection of the dogs that run.
 */
const getStationEntryLambda = lambda('getStationEntry', async (event) => {
  const eventId = getParam(event, 'eventId')
  const stationId = getParam(event, 'stationId')

  const confirmedEvent = await getLiveEvent<JsonConfirmedEvent>(eventId)
  const station = authorizeStationEntry(event, eventId, confirmedEvent, stationId)
  const registrations = await readEventRegistrations(eventId)

  return response(200, stationEntryResponse(confirmedEvent, station, registrations), event)
})

export default getStationEntryLambda
