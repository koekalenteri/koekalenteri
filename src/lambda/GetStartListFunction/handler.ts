import type { JsonPublicRegistration, JsonRegistrationWithGroup } from '../../types'
import {
  isResultsAvailableForRegistration,
  isStartListAvailable,
  isStartListAvailableForRegistration,
} from '../../lib/event'
import {
  formatOwnerNames,
  getHandlingPerson,
  getRegistrationOwners,
  resolveOwnerSelection,
} from '../../lib/registration'
import { authorizeWithMemberOf } from '../lib/auth'
import { getEvent } from '../lib/event'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'

/**
 * `ownerHandles` collapses the public row to "owner & handler", which only reads correctly when the
 * single owner handles the dog. With several owners the handler is named separately, even when they
 * are one of the owners. A legacy boolean refers to the single owner on file; a key that matches no
 * owner publishes `false` rather than guessing.
 */
const publishedOwnerHandles = (reg: JsonRegistrationWithGroup): boolean | undefined => {
  const { ownerHandles } = reg
  if (ownerHandles === undefined) return undefined
  if (getRegistrationOwners(reg).length > 1) return false
  if (typeof ownerHandles !== 'string') return !!ownerHandles
  return !!resolveOwnerSelection(reg.owners, reg.owner, ownerHandles)
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
          handler: getHandlingPerson(reg)?.name ?? '',
          owner: formatOwnerNames(reg),
          ownerHandles: publishedOwnerHandles(reg),
          ...(isResultsAvailableForRegistration(confirmedEvent, reg) ? { result: reg.eventResult?.result } : {}),
        }))
        .sort((a, b) => a.group.number - b.group.number) ?? []
  }

  return response(startListAvailable ? 200 : 404, publicRegs, event)
})

export default getStartListLambda
