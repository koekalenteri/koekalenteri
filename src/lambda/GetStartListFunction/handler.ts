import type { JsonPublicRegistration, JsonRegistrationWithGroup } from '../../types'
import { isStartListAvailable, isStartListAvailableForClass } from '../../lib/event'
import { authorizeWithMemberOf } from '../lib/auth'
import { getEvent } from '../lib/event'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'

const getStartListLambda = lambda('getStartList', async (event) => {
  const preview = event.resource === '/admin/startlist/{eventId}'
  const auth = preview ? await authorizeWithMemberOf(event) : undefined
  if (auth?.res) {
    return auth.res
  }

  const eventId = getParam(event, 'eventId')
  const confirmedEvent = await getEvent(eventId)
  if (auth?.user && !auth.user.admin && !auth.memberOf?.includes(confirmedEvent.organizer.id)) {
    throw new LambdaError(403, 'Forbidden')
  }

  const startListAvailable = preview || isStartListAvailable(confirmedEvent)
  let publicRegs: JsonPublicRegistration[] = []

  if (startListAvailable) {
    const items = await getRegistrationsByEventId(eventId)

    publicRegs =
      items
        ?.filter<JsonRegistrationWithGroup>((reg): reg is JsonRegistrationWithGroup => !!reg.group)
        .filter((reg) => reg.group.date && !reg.cancelled)
        .filter((reg) => {
          const eventClasses = confirmedEvent.classes?.filter((eventClass) => eventClass.class === reg.class) ?? []
          if (!eventClasses.length) return !confirmedEvent.classes?.length && startListAvailable
          if (preview) return true

          return eventClasses.some((eventClass) => isStartListAvailableForClass(confirmedEvent, eventClass))
        })
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
