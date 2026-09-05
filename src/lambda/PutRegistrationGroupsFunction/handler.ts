import type { EventState, JsonConfirmedEvent, JsonRegistration, JsonUser, RegistrationGroupMove } from '../../types'
import { hasSharedReserveList } from '../../lib/event'
import { isRegistrationPaid } from '../../lib/payment'
import {
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  getRegistrationGroupKey,
  isParticipantGroup,
} from '../../lib/registration'
import { applyRegistrationGroupMoves } from '../../lib/registrationGroups'
import { getOrigin } from '../lib/api-gw'
import { audit, registrationAuditKey } from '../lib/audit'
import { authorizeWithMemberOf } from '../lib/auth'
import { emailTo } from '../lib/email'
import { lockRegistrationGroups, saveGroup, updateRegistrations } from '../lib/event'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import {
  createRegistrationPatches,
  createSentRegistrationMessagesAudit,
  getCancelAuditMessage,
  getReadyRegistrationsByEventId,
  getRegistrationEditToken,
  participantRegistrationResponse,
  sendTemplatedEmailToEventRegistrations,
  updateReserveNotified,
} from '../lib/registration'
import { publishRegistrationPatches } from '../lib/ws/actions'
import { publishPublicStartList } from '../lib/ws/publicStartList'

const isEventOrClassState = (event: JsonConfirmedEvent, cls: string | null | undefined, state: EventState): boolean =>
  Boolean(event.state === state || (cls && event.classes.some((c) => c.class === cls && c.state === state)))

const classEquals = (a: string | null | undefined, b: string | null | undefined) => (!a && !b) || a === b

const regString = (r: JsonRegistration) =>
  `${r.group?.key}/${r.group?.number} ${r.id} ${r.dog.regNo}  ${r.dog.name} ${r.handler?.name} [${r.reserveNotified}]`

const auditSentMessages = async (
  event: JsonConfirmedEvent,
  label: string,
  labelKey: string,
  registrations: JsonRegistration[],
  ok: string[],
  failed: string[],
  user: JsonUser
) => {
  if (!ok.length && !failed.length) return
  await audit(
    createSentRegistrationMessagesAudit({ event, failed, label, labelKey, ok, registrations, user: user.name })
  )
}

const updateItems = async (oldItems: JsonRegistration[], moves: RegistrationGroupMove[], user: JsonUser) => {
  const { invalid, items: updatedItems } = applyRegistrationGroupMoves(oldItems, moves)
  if (invalid.length) {
    throw new LambdaError(409, 'Registration groups have changed. Please refresh and retry.')
  }

  // Finally save any changes
  for (const reg of updatedItems) {
    const oldGroup = oldItems.find((r) => r.id === reg.id)?.group
    const old = oldItems.find((item) => item.id === reg.id)
    if (
      reg.group?.key !== oldGroup?.key ||
      reg.group?.number !== oldGroup?.number ||
      reg.cancelled !== old?.cancelled ||
      reg.cancelReason !== old?.cancelReason
    ) {
      const reason = moves.some((move) => move.id === reg.id) ? 'siirto' : 'seuraus'

      // update cancellation status, so the counts get right in updateRegistrations
      reg.cancelled = reg.group?.key === GROUP_KEY_CANCELLED

      await saveGroup(reg, oldGroup, user, reason, reg.cancelReason)
    }
  }

  return updatedItems
}

const parseMoves = (json: string | null): RegistrationGroupMove[] => {
  const parsed = parseJSONWithFallback(json, [])
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    return []
  }
  // Legacy RegistrationGroupInfo payloads may still contain eventId,
  // cancelled, and group.number. Accept those extra fields while cached
  // clients expire; group.number is intentionally ignored, so a legacy item
  // without beforeId uses the move API's append semantics.
  // TODO: Reject legacy RegistrationGroupInfo-only fields after cached clients
  // have expired.
  const filtered: RegistrationGroupMove[] = parsed.filter((move): move is RegistrationGroupMove =>
    Boolean(
      move &&
        typeof move === 'object' &&
        // `position` belongs to transient drag state, not the API command.
        !('position' in move) &&
        typeof move.id === 'string' &&
        move.group &&
        typeof move.group.key === 'string'
    )
  )

  if (filtered.length === 0) {
    console.error('no valid registration group moves', parsed)
  } else if (filtered.length !== parsed.length) {
    console.error('invalid registration group moves', parsed)
    return []
  }
  return filtered
}

const putRegistrationGroupsLambda = lambda('putRegistrationGroups', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const origin = getOrigin(event)
  const eventId = getParam(event, 'eventId')
  const moves = parseMoves(event.body)

  if (moves.length === 0) {
    return response(422, 'no groups', event)
  }

  const authorizedEvent = await getAuthorizedEvent(user, memberOf, eventId)
  // A WT trial's reserve list is the whole trial's (KOE-912), so raising one dog shifts every class's
  // reserves up and the updated reserve notice can not stay inside the moved dog's class.
  const sharedReserve = hasSharedReserveList(authorizedEvent.eventType)

  // Keep the read, normalization, writes, and count recalculation on one event
  // snapshot. A concurrent request receives 409 instead of applying stale
  // ordering over this one.
  const releaseRegistrationGroupsLock = await lockRegistrationGroups(eventId)
  let oldItems: JsonRegistration[]
  let updatedItems: JsonRegistration[]
  let confirmedEvent: JsonConfirmedEvent
  let cls: string | null | undefined
  let oldCancelled: JsonRegistration[]
  let oldResCan: JsonRegistration[]

  try {
    oldItems = await getReadyRegistrationsByEventId(eventId, true)

    const affectedClasses = new Set(
      moves
        .map((move) => oldItems.find((registration) => registration.id === move.id)?.class)
        .filter(
          (registrationClass): registrationClass is NonNullable<JsonRegistration['class']> =>
            registrationClass !== undefined
        )
    )
    if (affectedClasses.size > 1) {
      throw new LambdaError(422, 'Registration group moves must belong to one class.')
    }

    // create a new copy of oldItems, so we can update without touching the original ones
    updatedItems = await updateItems(oldItems, moves, user)

    // update event counts
    confirmedEvent = await updateRegistrations(eventId, updatedItems)
    cls = updatedItems.find((item) => item.id === moves[0].id)?.class

    oldCancelled = oldItems.filter((reg) => getRegistrationGroupKey(reg) === GROUP_KEY_CANCELLED)
    oldResCan =
      oldItems.filter((reg) => [GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE].includes(getRegistrationGroupKey(reg))) ?? []
  } finally {
    await releaseRegistrationGroupsLock()
  }

  const emails = {
    cancelledFailed: [],
    cancelledOk: [],
    invitationAwaitingPayment: [],
    invitedFailed: [],
    invitedOk: [],
    pickedFailed: [],
    pickedOk: [],
    reserveFailed: [],
    reserveOk: [],
  }

  const picked = isEventOrClassState(confirmedEvent, cls, 'picked')
  const invited = isEventOrClassState(confirmedEvent, cls, 'invited')

  if (picked || invited) {
    /**
     * When event/class has already been 'picked' or 'invited', registrations moved from reserve to participants receive 'picked' email
     */
    const newParticipants = updatedItems.filter(
      (reg) =>
        classEquals(reg.class, cls) && isParticipantGroup(reg.group?.key) && oldResCan.some((old) => old.id === reg.id)
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
    await auditSentMessages(
      confirmedEvent,
      'Koepaikkailmoitus',
      'emailTemplate.picked',
      newParticipants,
      pickedOk,
      pickedFailed,
      user
    )

    /**
     * The koekutsu only goes to a place that has been paid for: a dog lifted from the reserve list
     * must not hold an invitation to a place it never paid (KOE-1191). The rest get theirs from the
     * payment callback once the money is in, and the secretary can always send one by hand before that.
     */
    const paidForPlace = (reg: JsonRegistration) => isRegistrationPaid(confirmedEvent, reg)
    const invitedParticipants = newParticipants.filter(paidForPlace)
    const awaitingPayment = invited ? newParticipants.filter((reg) => !paidForPlace(reg)) : []

    const { ok: invitedOk, failed: invitedFailed } = invited
      ? await sendTemplatedEmailToEventRegistrations(
          'invitation',
          confirmedEvent,
          invitedParticipants,
          origin,
          '',
          user.name,
          ''
        )
      : { failed: [], ok: [] }
    await auditSentMessages(
      confirmedEvent,
      'Koekutsu',
      'emailTemplate.invitation',
      invitedParticipants,
      invitedOk,
      invitedFailed,
      user
    )

    for (const reg of awaitingPayment) {
      await audit({
        auditKey: registrationAuditKey(reg),
        message: 'Koekutsu lähetetään, kun koepaikka on maksettu',
        user: user.name,
      })
    }

    /**
     * Registrations in reserve group that moved up from previous 'reserve' email, receive updated 'reserve' email
     */
    const movedReserve = updatedItems.filter(
      (reg) =>
        (sharedReserve || classEquals(reg.class, cls)) &&
        getRegistrationGroupKey(reg) === GROUP_KEY_RESERVE &&
        reg.reserveNotified &&
        (reg.reserveNotified === true
          ? oldResCan.find(
              (old) =>
                old.id === reg.id &&
                getRegistrationGroupKey(old) === GROUP_KEY_RESERVE &&
                (old.group?.number ?? 999) > (reg.group?.number ?? 999)
            )
          : reg.reserveNotified > (reg.group?.number ?? 999))
    )

    const { ok: reserveOk, failed: reserveFailed } = await sendTemplatedEmailToEventRegistrations(
      GROUP_KEY_RESERVE,
      confirmedEvent,
      movedReserve,
      origin,
      '',
      user.name,
      ''
    )
    await auditSentMessages(
      confirmedEvent,
      'Varasijailmoitus',
      'emailTemplate.reserve',
      movedReserve,
      reserveOk,
      reserveFailed,
      user
    )

    await updateReserveNotified(movedReserve)

    Object.assign(emails, {
      invitationAwaitingPayment: awaitingPayment.flatMap(emailTo),
      invitedFailed,
      invitedOk,
      pickedFailed,
      pickedOk,
      reserveFailed,
      reserveOk,
    })
  }

  /**
   * Registrations moved to cancelled group receive "cancelled" email
   */
  const cancelled = updatedItems.filter(
    (reg) =>
      classEquals(reg.class, cls) &&
      getRegistrationGroupKey(reg) === GROUP_KEY_CANCELLED &&
      !oldCancelled.some((old) => old.id === reg.id)
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
  await auditSentMessages(
    confirmedEvent,
    'Peruutusilmoitus',
    'emailTemplate.cancel-early',
    cancelled,
    cancelledOk,
    cancelledFailed,
    user
  )

  // audit cancellations
  for (const reg of cancelled) {
    const message = getCancelAuditMessage(reg)
    await audit({
      auditKey: registrationAuditKey(reg),
      message,
      user: user.name,
    })
  }

  Object.assign(emails, { cancelledFailed, cancelledOk })

  const changedRegistrations = createRegistrationPatches(updatedItems, oldItems)
  await publishRegistrationPatches(eventId, changedRegistrations, confirmedEvent.organizer.id)
  // Moving a dog between groups, and cancelling one, both change the published rows.
  await publishPublicStartList(confirmedEvent)
  const responseItems = await Promise.all(
    updatedItems.map(async (registration) =>
      participantRegistrationResponse(registration, await getRegistrationEditToken(registration))
    )
  )

  return response(
    200,
    { classes: confirmedEvent.classes, entries: confirmedEvent.entries, items: responseItems, ...emails },
    event
  )
})

export default putRegistrationGroupsLambda
