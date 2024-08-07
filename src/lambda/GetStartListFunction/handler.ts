import type { JsonPublicRegistration, JsonRegistration, JsonRegistrationWithGroup } from '../../types'

import { CONFIG } from '../config'
import { getEvent } from '../lib/event'
import { getParam, lambda } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.registrationTable)

const getStartListLambda = lambda('getStartList', async (event) => {
  const eventId = getParam(event, 'eventId')
  const confirmedEvent = await getEvent(eventId)
  let publicRegs: JsonPublicRegistration[] = []

  if (['invited', 'started', 'ended', 'completed'].includes(confirmedEvent?.state ?? '')) {
    const items = await dynamoDB.query<JsonRegistration>('eventId = :eventId', {
      ':eventId': eventId,
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
