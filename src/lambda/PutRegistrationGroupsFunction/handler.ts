import type { GroupChangeReason } from '../../lib/audit'
import type {
  EmailTemplateId,
  EventState,
  JsonConfirmedEvent,
  JsonRegistration,
  JsonUser,
  RegistrationGroupMove,
} from '../../types'
import { invitationAwaitingPaymentAudit } from '../../lib/audit'
import { hasSharedReserveList } from '../../lib/event'
import { getPaymentPicture } from '../../lib/payment'
import {
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  getRegistrationGroupKey,
  isInvitationAwaitingPayment,
  isParticipantGroup,
  REGISTRATION_WRITE_CONCURRENCY,
  shouldSendInvitationAfterPayment,
} from '../../lib/registration'
import { applyRegistrationGroupMoves } from '../../lib/registrationGroups'
import { requestDay } from '../../lib/storedDays'
import { mapWithConcurrency } from '../../lib/utils'
import { getOrigin } from '../lib/api-gw'
import { audit, registrationAuditKey } from '../lib/audit'
import { authorizeWithMemberOf } from '../lib/auth'
import { emailTo } from '../lib/email'
import { lockRegistrationGroups, saveGroup, updateRegistrations } from '../lib/event'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import { getParam, httpError, LambdaError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { publishParticipantPayments } from '../lib/payment'
import {
  adminRegistrationResponse,
  createRegistrationPatches,
  createSentRegistrationMessagesAudit,
  getCancelAuditMessage,
  getReadyRegistrationsByEventId,
  getRegistrationEditToken,
  sendTemplatedEmailToEventRegistrations,
  updateReserveNotified,
} from '../lib/registration'
import { releaseStartNumber } from '../lib/startNumbers'
import { publishEventCounts, publishPublicStartList, publishRegistrationPatches } from '../lib/ws/actions'

const isEventOrClassState = (event: JsonConfirmedEvent, cls: string | null | undefined, state: EventState): boolean =>
  Boolean(event.state === state || (cls && event.classes.some((c) => c.class === cls && c.state === state)))

const classEquals = (a: string | null | undefined, b: string | null | undefined) => (!a && !b) || a === b

// Identifies the registration in a log line. The handler's name is deliberately left out: it is
// personal data, and the registration id already says which entry this is.
const regString = (r: JsonRegistration) =>
  `${r.group?.key}/${r.group?.number} ${r.id} ${r.dog.regNo} [${r.reserveNotified}]`

const auditSentMessages = async (
  event: JsonConfirmedEvent,
  template: EmailTemplateId,
  registrations: JsonRegistration[],
  ok: string[],
  failed: string[],
  user: JsonUser
) => {
  if (!ok.length && !failed.length) return
  await audit(createSentRegistrationMessagesAudit({ event, failed, ok, registrations, template, user: user.name }))
}

const updateItems = async (oldItems: JsonRegistration[], moves: RegistrationGroupMove[], user: JsonUser) => {
  const { invalid, items: updatedItems } = applyRegistrationGroupMoves(oldItems, moves)
  if (invalid.length) {
    throw new LambdaError(409, 'Registration groups have changed. Please refresh and retry.')
  }

  // Finally save any changes. Every registration's row is its own; the saves need not wait for
  // one another.
  const oldById = new Map(oldItems.map((item) => [item.id, item]))
  const changed = updatedItems.filter((reg) => hasGroupChanged(reg, oldById.get(reg.id)))
  await mapWithConcurrency(changed, REGISTRATION_WRITE_CONCURRENCY, (reg) => {
    const old = oldById.get(reg.id)
    const reason = moves.some((move) => move.id === reg.id) ? 'move' : 'consequence'
    return saveChangedGroup(reg, old, user, reason)
  })

  return updatedItems
}

const hasGroupChanged = (reg: JsonRegistration, old: JsonRegistration | undefined) =>
  reg.group?.key !== old?.group?.key ||
  reg.group?.number !== old?.group?.number ||
  reg.cancelled !== old?.cancelled ||
  reg.cancelReason !== old?.cancelReason

/**
 * The registrations whose place changed: a group key (a participant group, the reserve or the
 * cancelled) is all of the group the payment picture reads (KOE-1553). A dog only renumbered pays as
 * it did, so its entrant hears nothing.
 */
const placeChangedIds = (updatedItems: JsonRegistration[], oldItems: JsonRegistration[]) => {
  const oldKeys = new Map(oldItems.map((item) => [item.id, getRegistrationGroupKey(item)]))
  return updatedItems.filter((reg) => getRegistrationGroupKey(reg) !== oldKeys.get(reg.id)).map((reg) => reg.id)
}

const saveChangedGroup = async (
  reg: JsonRegistration,
  old: JsonRegistration | undefined,
  user: JsonUser,
  reason: GroupChangeReason
) => {
  // update cancellation status, so the counts get right in updateRegistrations
  reg.cancelled = reg.group?.key === GROUP_KEY_CANCELLED

  await saveGroup(reg, old?.group, user, reason, reg.cancelReason)

  // The move decided the number is gone (KOE-1428); the row and the dog's trail follow.
  if (old?.startGroup && !reg.startGroup) {
    await releaseStartNumber(reg.eventId, reg, old.startGroup.number, user.name)
  }
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
    logger.error('no valid registration group moves', { moves: parsed.length })
  } else if (filtered.length !== parsed.length) {
    logger.error('invalid registration group moves', { moves: parsed.length, valid: filtered.length })
    return []
  }
  // A group's day is stored as a key (KOE-1547); a browser loaded before that sends an instant.
  for (const move of filtered) {
    const day = requestDay(move.group.date)
    if (day) move.group.date = day
  }
  return filtered
}

const putRegistrationGroupsLambda = lambda('putRegistrationGroups', async (event) => {
  const { user, memberOf } = await authorizeWithMemberOf(event)

  const origin = getOrigin(event)
  const eventId = getParam(event, 'eventId')
  const moves = parseMoves(event.body)

  if (moves.length === 0) {
    throw httpError(422, 'no groups')
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
    await publishEventCounts(confirmedEvent)
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

    logger.info('new participants picked from reserve', { newParticipants: newParticipants.map(regString) })

    const { ok: pickedOk, failed: pickedFailed } = await sendTemplatedEmailToEventRegistrations(
      'picked',
      confirmedEvent,
      newParticipants,
      origin,
      '',
      user,
      ''
    )
    await auditSentMessages(confirmedEvent, 'picked', newParticipants, pickedOk, pickedFailed, user)

    /**
     * The koekutsu only goes to a place that has been paid for: a dog lifted from the reserve list
     * must not hold an invitation to a place it never paid (KOE-1191). The rest get theirs from the
     * payment callback once the money is in, and the secretary can always send one by hand before that.
     */
    const withPayment = newParticipants.map((reg) => ({ payment: getPaymentPicture(confirmedEvent, reg, []), reg }))
    const invitedParticipants = withPayment
      .filter(({ payment, reg }) => shouldSendInvitationAfterPayment(confirmedEvent, reg, payment))
      .map(({ reg }) => reg)
    const awaitingPayment = withPayment
      .filter(({ payment, reg }) => isInvitationAwaitingPayment(confirmedEvent, reg, payment))
      .map(({ reg }) => reg)

    const { ok: invitedOk, failed: invitedFailed } = invited
      ? await sendTemplatedEmailToEventRegistrations(
          'invitation',
          confirmedEvent,
          invitedParticipants,
          origin,
          '',
          user,
          ''
        )
      : { failed: [], ok: [] }
    await auditSentMessages(confirmedEvent, 'invitation', invitedParticipants, invitedOk, invitedFailed, user)

    await mapWithConcurrency(awaitingPayment, REGISTRATION_WRITE_CONCURRENCY, (reg) =>
      audit({
        auditKey: registrationAuditKey(reg),
        ...invitationAwaitingPaymentAudit(),
        user: user.name,
      })
    )

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
      user,
      ''
    )
    await auditSentMessages(confirmedEvent, 'reserve', movedReserve, reserveOk, reserveFailed, user)

    await updateReserveNotified(movedReserve)

    Object.assign(emails, {
      invitationAwaitingPayment: awaitingPayment.flatMap((registration) => emailTo(registration)),
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

  logger.info('cancelled registrations', { cancelled: cancelled.map(regString) })

  const { ok: cancelledOk, failed: cancelledFailed } = await sendTemplatedEmailToEventRegistrations(
    'registration',
    confirmedEvent,
    cancelled,
    origin,
    '',
    user,
    'cancel'
  )
  await auditSentMessages(confirmedEvent, 'cancel-early', cancelled, cancelledOk, cancelledFailed, user)

  // audit cancellations
  for (const reg of cancelled) {
    await audit({
      auditKey: registrationAuditKey(reg),
      ...getCancelAuditMessage(reg),
      user: user.name,
    })
  }

  Object.assign(emails, { cancelledFailed, cancelledOk })

  const changedRegistrations = createRegistrationPatches(updatedItems, oldItems)
  await publishRegistrationPatches(eventId, changedRegistrations, confirmedEvent.organizer.id)
  await publishParticipantPayments(confirmedEvent, placeChangedIds(updatedItems, oldItems))
  // Moving a dog between groups, and cancelling one, both change the published rows.
  await publishPublicStartList(eventId)
  const responseItems = await Promise.all(
    updatedItems.map(async (registration) =>
      adminRegistrationResponse(registration, getRegistrationEditToken(registration))
    )
  )

  return response(
    200,
    { classes: confirmedEvent.classes, entries: confirmedEvent.entries, items: responseItems, ...emails },
    event
  )
})

export default putRegistrationGroupsLambda
