import type { JsonConfirmedEvent } from '../../types'
import { authorizeWithMemberOf } from '../lib/auth'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getStationEntryToken } from '../lib/stationEntry'

/**
 * The token a secretary shares with a station. Computed on request rather than stored, so revocation
 * is nothing but bumping the station's `tokenVersion` and asking again.
 */
const getStationLinkLambda = lambda('getStationLink', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const eventId = getParam(event, 'eventId')
  const stationId = getParam(event, 'stationId')

  const confirmedEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, eventId)
  const station = confirmedEvent.stations?.find((item) => item.id === stationId)
  if (!station) throw new LambdaError(404, 'not found')

  return response(200, { token: await getStationEntryToken(eventId, station) }, event)
})

export default getStationLinkLambda
