import type { JsonPublicRegistration, JsonRegistrationWithGroup } from '../../types'
import {
  isResultsAvailableForRegistration,
  isStartListAvailable,
  isStartListAvailableForRegistration,
  isStartNumbersAvailableForRegistration,
} from '../../lib/event'
import {
  formatOwnerNames,
  getHandlingPerson,
  getRegistrationOwners,
  resolveOwnerSelection,
  sortRegistrationsByDateClassTimeAndNumber,
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
          // Until the class's numbers are published the number is withheld (KOE-1006): the dogs are
          // real but the order is not, and a number that still moves must not look like a promise.
          group:
            preview || isStartNumbersAvailableForRegistration(confirmedEvent, reg)
              ? reg.group
              : { ...reg.group, number: undefined },
          handler: getHandlingPerson(reg)?.name ?? '',
          owner: formatOwnerNames(reg),
          ownerHandles: publishedOwnerHandles(reg),
          ...(isResultsAvailableForRegistration(confirmedEvent, reg) ? { result: reg.eventResult?.result } : {}),
        }))
        // Groups keep their day/class/time order either way; within a group a withheld number falls
        // back to the dog's name, so the unconfirmed list reads alphabetically rather than leaking
        // the draft order through its row positions.
        .sort(
          (a, b) =>
            sortRegistrationsByDateClassTimeAndNumber(a, b) || (a.dog.name ?? '').localeCompare(b.dog.name ?? '', 'fi')
        ) ?? []
  }

  return response(startListAvailable ? 200 : 404, publicRegs, event)
})

export default getStartListLambda
