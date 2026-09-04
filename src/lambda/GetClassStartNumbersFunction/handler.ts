import type { JsonConfirmedEvent } from '../../types'
import { getEvent } from '../lib/event'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { authorizeStartNumberLink, classStartNumbersResponse } from '../lib/startNumberLink'

/**
 * The class secretary's draw sheet (KOE-1267), behind the class's own tokenized link rather than a
 * login: one class of the trial, the dogs that run in it, and the working order numbers the draw
 * redistributes.
 */
const getClassStartNumbersLambda = lambda('getClassStartNumbers', async (event) => {
  const eventId = getParam(event, 'eventId')
  const eventClass = getParam(event, 'eventClass')

  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)
  await authorizeStartNumberLink(event, eventId, confirmedEvent, eventClass)
  const registrations = await getRegistrationsByEventId(eventId)

  return response(200, classStartNumbersResponse(confirmedEvent, eventClass, registrations), event)
})

export default getClassStartNumbersLambda
