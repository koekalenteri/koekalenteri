import type { JsonPublicRegistration, JsonRegistrationWithGroup } from '../../types'
import { isStartListAvailable, isStartListPublishedForClass } from '../../lib/event'
import { getEvent } from '../lib/event'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'

const getStartListLambda = lambda('getStartList', async (event) => {
  const eventId = getParam(event, 'eventId')
  const confirmedEvent = await getEvent(eventId)
  const startListAvailable = isStartListAvailable(confirmedEvent)
  let publicRegs: JsonPublicRegistration[] = []

  if (startListAvailable) {
    const items = await getRegistrationsByEventId(eventId)

    publicRegs =
      items
        ?.filter<JsonRegistrationWithGroup>((reg): reg is JsonRegistrationWithGroup => !!reg.group)
        .filter((reg) => reg.group.date && !reg.cancelled)
        .filter((reg) => isStartListPublishedForClass(confirmedEvent, reg.class ?? ''))
        .map<JsonPublicRegistration>((reg) => ({
          breeder: reg.breeder?.name,
          class: reg.class,
          dog: reg.dog,
          group: reg.group,
          handler: reg.handler?.name ?? '',
          owner: reg.owner?.name ?? '',
          ownerHandles: reg.ownerHandles,
        }))
        .sort((a, b) => a.group.number - b.group.number) ?? []
  }

  return response(startListAvailable ? 200 : 404, publicRegs, event)
})

export default getStartListLambda
