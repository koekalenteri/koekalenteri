import type { JsonPublicRegistration, JsonRegistration, JsonRegistrationWithGroup } from '../../types'

import { isStartListAvailable } from '../../lib/event'
import { CONFIG } from '../config'
import { getEvent } from '../lib/event'
import { getParam, lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.registrationTable)

const getStartListLambda = lambda('getStartList', async (event) => {
  const eventId = getParam(event, 'eventId')
  const confirmedEvent = await getEvent(eventId)
  let publicRegs: JsonPublicRegistration[] = []

  if (isStartListAvailable(confirmedEvent)) {
    const items = await dynamoDB.query<JsonRegistration>({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })

    publicRegs =
      items
        ?.filter<JsonRegistrationWithGroup>((reg): reg is JsonRegistrationWithGroup => !!reg.group)
        .filter((reg) => reg.group.date && !reg.cancelled)
        .map<JsonPublicRegistration>((reg) => ({
          class: reg.class,
          dog: reg.dog,
          group: reg.group,
          handler: reg.handler?.name,
          owner: reg.owner?.name,
          breeder: reg.breeder?.name,
          ownerHandles: reg.ownerHandles,
        }))
        .sort((a, b) => a.group.number - b.group.number) ?? []
  }

  return response(publicRegs.length > 0 ? 200 : 404, publicRegs, event)
})

export default getStartListLambda
