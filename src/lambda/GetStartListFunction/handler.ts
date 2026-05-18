import type { JsonPublicRegistration, JsonRegistrationWithGroup } from '../../types'
import { isStartListAvailable } from '../../lib/event'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { eventReadPort } from '../registration/api'

export const getStartListLambda = async (event: APIGatewayProxyEvent) => {
  const eventId = getParam(event, 'eventId')
  const confirmedEvent = await eventReadPort.getConfirmedEvent(eventId)
  let publicRegs: JsonPublicRegistration[] = []

  if (isStartListAvailable(confirmedEvent)) {
    const items = await getRegistrationsByEventId(eventId)

    publicRegs =
      items
        ?.filter<JsonRegistrationWithGroup>((reg): reg is JsonRegistrationWithGroup => !!reg.group)
        .filter((reg) => reg.group.date && !reg.cancelled)
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

  return response(publicRegs.length > 0 ? 200 : 404, publicRegs, event)
}

export default lambda('getStartList', getStartListLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
