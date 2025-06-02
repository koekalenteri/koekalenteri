import type { EventState, JsonConfirmedEvent, JsonRegistration, JsonRegistrationGroupInfo, JsonUser } from '../../types'

import { getRegistrationGroupKey, GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../lib/registration'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { audit, registrationAuditKey } from '../lib/audit'
import { authorize } from '../lib/auth'
import { fixRegistrationGroups, saveGroup, updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { getParam, lambda, response } from '../lib/lambda'
import { getCancelAuditMessage, isParticipantGroup, sendTemplatedEmailToEventRegistrations } from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { registrationTable } = CONFIG
export const dynamoDB = new CustomDynamoClient(registrationTable)

const isEventOrClassState = (event: JsonConfirmedEvent, cls: string | null | undefined, state: EventState): boolean =>
  Boolean(event.state === state || (cls && event.classes.find((c) => c.class === cls && c.state === state)))

const classEquals = (a: string | null | undefined, b: string | null | undefined) => (!a && !b) || a === b

const regString = (r: JsonRegistration) =>
  `${r.group?.key}/${r.group?.number} ${r.id} ${r.dog.regNo}  ${r.dog.name} ${r.handler.name} [${r.reserveNotified}]`

const updateItems = async (oldItems: JsonRegistration[], eventGroups: JsonRegistrationGroupInfo[], user: JsonUser) => {
  // create a new copy of oldItems, so we can update without touching the original ones
  const updatedItems: JsonRegistration[] = oldItems.map((r) => ({ ...r }))

  // update the items in memory first
  for (const group of eventGroups) {
    const reg = updatedItems.find((r) => r.id === group.id)
    if (reg) {
      Object.assign(reg, group)
    }
  }

  // fix numbering etc, because client might provide outdated / out of bounds info, but do not update db
  await fixRegistrationGroups(updatedItems, user, false)

  // Finally save any changes
  for (const reg of updatedItems) {
    const oldGroup = oldItems.find((r) => r.id === reg.id)?.group
    if (reg.group?.key !== oldGroup?.key || reg.group?.number !== oldGroup?.number) {
      const reason = eventGroups.find((g) => g.id === reg.id) ? 'siirto' : 'seuraus'

      // update cancellation status, so the counts get right in updateRegistrations
      reg.cancelled = reg.group?.key === GROUP_KEY_CANCELLED

      await saveGroup(reg, oldGroup, user, reason, reg.cancelReason)
    }
  }

  return updatedItems
}

const parseGroups = (json: string | null, eventId: string): JsonRegistrationGroupInfo[] => {
  const parsed = parseJSONWithFallback(json, [])
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    return []
  }
  const filtered: JsonRegistrationGroupInfo[] = parsed.filter((g) => g.eventId === eventId)

  if (filtered.length === 0) {
    console.error(`no groups after filtering by eventId='${eventId}'`, parsed)
  }
  return filtered
}

const putRegistrationGroupsLambda = lambda('putRegistrationGroups', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }
  const origin = getOrigin(event)
  const eventId = getParam(event, 'eventId')
  const eventGroups = parseGroups(event.body, eventId)

  if (eventGroups.length === 0) {
    return response(422, 'no groups', event)
  }

  const oldItems =
    (
      await dynamoDB.query<JsonRegistration>({
        key: 'eventId = :eventId',
        values: { ':eventId': eventId },
      })
    )?.filter((r) => r.state === 'ready') ?? []

  // create a new copy of oldItems, so we can update without touching the original ones
  const updatedItems = await updateItems(oldItems, eventGroups, user)

  // update event counts
  const confirmedEvent = await updateRegistrations(eventId, updatedItems)
  const cls = updatedItems.find((item) => item.id === eventGroups[0].id)?.class

  const emails = {
    invitedOk: [],
    invitedFailed: [],
    pickedOk: [],
    pickedFailed: [],
    reserveOk: [],
    reserveFailed: [],
    cancelledOk: [],
    cancelledFailed: [],
  }

  const oldCancelled = oldItems.filter((reg) => getRegistrationGroupKey(reg) === GROUP_KEY_CANCELLED)
  const oldResCan =
    oldItems.filter((reg) => [GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE].includes(getRegistrationGroupKey(reg))) ?? []

  const picked = isEventOrClassState(confirmedEvent, cls, 'picked')
  const invited = isEventOrClassState(confirmedEvent, cls, 'invited')

  if (picked || invited) {
    /**
     * When event/class has already been 'picked' or 'invited', registrations moved from reserve to participants receive 'picked' email
     */
    const newParticipants = updatedItems.filter(
      (reg) =>
        classEquals(reg.class, cls) && isParticipantGroup(reg.group?.key) && oldResCan.find((old) => old.id === reg.id)
    )

    console.log({
      newParticipants: newParticipants.map(regString),
    })

    const { ok: pickedOk, failed: pickedFailed } = await sendTemplatedEmailToEventRegistrations(
      'picked',
      confirmedEvent,
      newParticipants,
      origin,
      '',
      user.name,
      ''
    )

    const { ok: invitedOk, failed: invitedFailed } = invited
      ? await sendTemplatedEmailToEventRegistrations(
          'invitation',
          confirmedEvent,
          newParticipants,
          origin,
          '',
          user.name,
          ''
        )
      : { ok: [], failed: [] }

    /**
     * Registrations in reserve group that moved up, receive updated 'reserve' email
     */
    const movedReserve = updatedItems.filter(
      (reg) =>
        classEquals(reg.class, cls) &&
        getRegistrationGroupKey(reg) === GROUP_KEY_RESERVE &&
        reg.reserveNotified &&
        oldResCan.find(
          (old) =>
            old.id === reg.id &&
            getRegistrationGroupKey(old) === GROUP_KEY_RESERVE &&
            (old.group?.number ?? 999) > (reg.group?.number ?? 999)
        )
    )

    console.log({ movedReserve: movedReserve.map(regString) })

    const { ok: reserveOk, failed: reserveFailed } = await sendTemplatedEmailToEventRegistrations(
      GROUP_KEY_RESERVE,
      confirmedEvent,
      movedReserve,
      origin,
      '',
      user.name,
      ''
    )

    Object.assign(emails, {
      invitedOk,
      invitedFailed,
      pickedOk,
      pickedFailed,
      reserveOk,
      reserveFailed,
    })
  }

  /**
   * Registrations moved to cancelled group receive "cancelled" email
   */
  const cancelled = updatedItems.filter(
    (reg) =>
      classEquals(reg.class, cls) &&
      getRegistrationGroupKey(reg) === GROUP_KEY_CANCELLED &&
      !oldCancelled.find((old) => old.id === reg.id)
  )

  console.log({ cancelled: cancelled.map(regString) })

  const { ok: cancelledOk, failed: cancelledFailed } = await sendTemplatedEmailToEventRegistrations(
    'registration',
    confirmedEvent,
    cancelled,
    origin,
    '',
    user.name,
    'cancel'
  )

  // audit cancellations
  for (const reg of cancelled) {
    const message = getCancelAuditMessage(reg)
    audit({
      auditKey: registrationAuditKey(reg),
      message,
      user: user.name,
    })
  }

  Object.assign(emails, { cancelledOk, cancelledFailed })

  return response(
    200,
    { items: updatedItems, classes: confirmedEvent.classes, entries: confirmedEvent.entries, ...emails },
    event
  )
})

export default putRegistrationGroupsLambda
