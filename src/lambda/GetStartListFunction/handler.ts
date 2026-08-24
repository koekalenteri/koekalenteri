import type { JsonPublicRegistration, JsonRegistrationWithGroup } from '../../types'
import { isStartListAvailable, isStartListAvailableForRegistration } from '../../lib/event'
import { getRegistrationOwners, resolveOwnerSelection } from '../../lib/registration'
import { authorizeWithMemberOf } from '../lib/auth'
import { getEvent } from '../lib/event'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'

/**
 * The public projection only exposes the first owner's name, so `ownerHandles` is published only
 * when the handling owner is that owner. A legacy boolean always refers to the single owner on
 * file; a key that matches no owner publishes `false` rather than guessing.
 */
const publishedOwnerHandles = (reg: JsonRegistrationWithGroup): boolean | undefined => {
  const { ownerHandles } = reg
  if (ownerHandles === undefined) return undefined
  if (typeof ownerHandles !== 'string') return !!ownerHandles
  return resolveOwnerSelection(reg.owners, reg.owner, ownerHandles) === getRegistrationOwners(reg)[0]
}

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
          // Keep preview limited to event classes even though it bypasses publication checks.
          const hasEventClass = confirmedEvent.classes?.some((eventClass) => eventClass.class === reg.class)
          if (!hasEventClass && confirmedEvent.classes?.length) return false
          if (preview) return true
          return isStartListAvailableForRegistration(confirmedEvent, reg)
        })
        .map<JsonPublicRegistration>((reg) => ({
          breeder: reg.breeder?.name,
          class: reg.class,
          dog: reg.dog,
          group: reg.group,
          handler: reg.handler?.name ?? '',
          owner: getRegistrationOwners(reg)[0]?.name ?? '',
          ownerHandles: publishedOwnerHandles(reg),
        }))
        .sort((a, b) => a.group.number - b.group.number) ?? []
  }

  return response(startListAvailable ? 200 : 404, publicRegs, event)
})

export default getStartListLambda
