import type { JsonPublicRegistration, JsonPublicRegistrationGroup, JsonRegistration } from '../../types'
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
const publishedOwnerHandles = (reg: JsonRegistration): boolean | undefined => {
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
  const publicRegs: JsonPublicRegistration[] = []

  if (startListAvailable) {
    const items = (await getRegistrationsByEventId(eventId)) ?? []

    for (const reg of items) {
      // Keep preview limited to event classes even though it bypasses publication checks.
      const hasEventClass = confirmedEvent.classes?.some((eventClass) => eventClass.class === reg.class)
      if (!hasEventClass && confirmedEvent.classes?.length) continue

      if (reg.cancelled) {
        // A cancelled dog appears as its frozen number and nothing more (KOE-1017): the number is
        // published truth and must not slide onto the next dog, but the dog itself, its owner and
        // its handler are no longer anyone's business. The narrow row is built here rather than
        // filtered in the browser, so the details never leave the server.
        const placement = reg.startGroup
        if (!placement?.date) continue
        const probe = { class: reg.class, group: placement }
        if (
          !preview &&
          !(
            isStartListAvailableForRegistration(confirmedEvent, probe) &&
            isStartNumbersAvailableForRegistration(confirmedEvent, probe)
          )
        ) {
          continue
        }

        publicRegs.push({
          breeder: '',
          cancelled: true,
          class: reg.class,
          dog: { name: '', regNo: '' },
          group: placement,
          handler: '',
          owner: '',
        })
        continue
      }

      const group = reg.group
      if (!group?.date) continue
      const registered = { class: reg.class, group }
      if (!preview && !isStartListAvailableForRegistration(confirmedEvent, registered)) continue

      const numbersAvailable = isStartNumbersAvailableForRegistration(confirmedEvent, registered)
      // The published number is the frozen one. The preview shows it too, as soon as it exists
      // (KOE-1218): the secretary entered it and expects to see it back; the working order fills in
      // only where no number has been drawn, and is flagged provisional so the preview can render it
      // as such. Until the class's numbers are published the public number is withheld (KOE-1006):
      // the dogs are real but the order is not, and a number that still moves must not look like a
      // promise.
      let publicGroup: JsonPublicRegistrationGroup = reg.startGroup ?? group
      if (!preview && !numbersAvailable) {
        publicGroup = { ...group, number: undefined }
      }

      publicRegs.push({
        ...(preview ? { numberProvisional: !reg.startGroup } : {}),
        breeder: reg.breeder?.name,
        class: reg.class,
        dog: reg.dog,
        group: publicGroup,
        handler: getHandlingPerson(reg)?.name ?? '',
        owner: formatOwnerNames(reg),
        ownerHandles: publishedOwnerHandles(reg),
        ...(isResultsAvailableForRegistration(confirmedEvent, registered) ? { result: reg.eventResult?.result } : {}),
      })
    }

    // Groups keep their day/class/time order either way; within a group a withheld number falls
    // back to the dog's name, so the unconfirmed list reads alphabetically rather than leaking
    // the draft order through its row positions.
    publicRegs.sort(
      (a, b) =>
        sortRegistrationsByDateClassTimeAndNumber(a, b) || (a.dog.name ?? '').localeCompare(b.dog.name ?? '', 'fi')
    )
  }

  return response(startListAvailable ? 200 : 404, publicRegs, event)
})

export default getStartListLambda
