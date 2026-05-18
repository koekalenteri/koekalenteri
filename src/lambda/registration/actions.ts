// Registration write orchestration.
//
// Each exported function is a use-case entrypoint that:
//   1. loads current state through a RegistrationRepository
//   2. calls pure rules to build patches
//   3. persists through the repository
//   4. returns a structured result for the handler to act on
//
// Actions must not import DynamoDB or websocket helpers directly.
// Concrete adapters are injected by callers.

import type { EventState, JsonConfirmedEvent, JsonRegistration, JsonRegistrationGroupInfo, JsonUser } from '../../types'
import type { EventReadPort, GroupChangeNotifier, RegistrationStatsPort, SyncAggregatesPort } from './api'
import type { PaymentStatePatch, RefundStatePatch, RegistrationPatch, RegistrationRepository } from './repository'
import { nanoid } from 'nanoid'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE, getRegistrationGroupKey } from '../../lib/registration'
import { isEntryOpen } from '../../lib/utils'
import { saveGroup } from './groups'
import { buildRegistrationPatch } from './rules'

// ---------------------------------------------------------------------------
// Apply payment success
// ---------------------------------------------------------------------------

type ApplyPaymentSuccessCommand = {
  eventId: string
  registrationId: string
  /** Amount paid in this transaction, in currency units (not cents). */
  paidAmount: number
  /** ISO-8601 timestamp for when the payment occurred. */
  paidAt: string
}

type ApplyPaymentSuccessResult = {
  /** The registration state before the patch was applied. */
  previous: JsonRegistration
  /** The updated registration after the patch was applied. */
  registration: JsonRegistration
  /** The patch that was persisted so callers can drive downstream side effects. */
  patch: PaymentStatePatch
}

type ApplyPaymentCancelCommand = {
  eventId: string
  registrationId: string
}

type ApplyPaymentCancelResult = {
  previous: JsonRegistration
  registration: JsonRegistration
}

/**
 * Builds and applies the payment-state patch for a successful payment.
 *
 * This action owns the payment-state transition rules:
 * - accumulates `paidAmount` on top of any previously paid amount
 * - transitions `paymentStatus` to `'SUCCESS'`
 * - transitions `state` to `'ready'`
 * - sets `confirmed` to `true` when the registration was previously picked
 *
 * The handler remains responsible for triggering aggregate sync and sending
 * the receipt email using the returned `registration` and `patch`.
 */
export const createApplyPaymentSuccess =
  (repo: RegistrationRepository) =>
  async (cmd: ApplyPaymentSuccessCommand): Promise<ApplyPaymentSuccessResult> => {
    const existing = await repo.getById(cmd.eventId, cmd.registrationId)
    if (!existing) {
      throw new Error(`Registration '${cmd.registrationId}' for event '${cmd.eventId}' was not found`)
    }

    const previouslyPaid = existing.paidAmount ?? 0
    const newPaidAmount = previouslyPaid + cmd.paidAmount

    const patch: PaymentStatePatch = {
      paidAmount: newPaidAmount,
      paidAt: cmd.paidAt,
      paymentStatus: 'SUCCESS',
      state: 'ready',
      // registration paid after being picked to the event also confirms the place
      ...(existing.messagesSent?.picked ? { confirmed: true } : {}),
    }

    await repo.patchPaymentState(cmd.eventId, cmd.registrationId, patch)

    const updated: JsonRegistration = {
      ...existing,
      ...patch,
    }

    return { patch, previous: existing, registration: updated }
  }

export const createApplyPaymentCancel =
  (repo: RegistrationRepository) =>
  async (cmd: ApplyPaymentCancelCommand): Promise<ApplyPaymentCancelResult> => {
    const existing = await repo.getById(cmd.eventId, cmd.registrationId)
    if (!existing) {
      throw new Error(`Registration '${cmd.registrationId}' for event '${cmd.eventId}' was not found`)
    }

    if (existing.paymentStatus !== 'PENDING') {
      return { previous: existing, registration: existing }
    }

    const patch: PaymentStatePatch = {
      paidAmount: existing.paidAmount ?? 0,
      paidAt: existing.paidAt ?? new Date(0).toISOString(),
      paymentStatus: 'CANCEL',
      state: existing.state,
    }

    await repo.patchPaymentState(cmd.eventId, cmd.registrationId, patch)

    const updated: JsonRegistration = {
      ...existing,
      paymentStatus: 'CANCEL',
    }

    return { previous: existing, registration: updated }
  }

// ---------------------------------------------------------------------------
// Apply refund success
// ---------------------------------------------------------------------------

type ApplyRefundSuccessCommand = {
  eventId: string
  registrationId: string
  /** Refund amount in currency units (not cents). */
  refundAmount: number
  /** ISO-8601 timestamp for when the refund was confirmed. */
  refundAt: string
}

type ApplyRefundSuccessResult = {
  /** The registration state before the patch was applied. */
  previous: JsonRegistration
  /** The updated registration after the patch was applied. */
  registration: JsonRegistration
  /** The patch that was persisted so callers can drive downstream side effects. */
  patch: RefundStatePatch
}

type ApplyRefundCancelCommand = {
  eventId: string
  registrationId: string
}

type ApplyRefundCancelResult = {
  previous: JsonRegistration
  registration: JsonRegistration
}

/**
 * Builds and applies the refund-state patch for a successful refund.
 *
 * This action owns the refund-state transition rules:
 * - accumulates `refundAmount` on top of any previous refunds
 * - transitions `refundStatus` to `'SUCCESS'`
 * - records the `refundAt` timestamp
 *
 * The handler remains responsible for sending the refund notification email
 * and writing audit entries using the returned `registration` and `patch`.
 */
export const createApplyRefundSuccess =
  (repo: RegistrationRepository) =>
  async (cmd: ApplyRefundSuccessCommand): Promise<ApplyRefundSuccessResult> => {
    const existing = await repo.getById(cmd.eventId, cmd.registrationId)
    if (!existing) {
      throw new Error(`Registration '${cmd.registrationId}' for event '${cmd.eventId}' was not found`)
    }

    const previousRefund = existing.refundAmount ?? 0
    const newRefundAmount = previousRefund + cmd.refundAmount

    const patch: RefundStatePatch = {
      refundAmount: newRefundAmount,
      refundAt: cmd.refundAt,
      refundStatus: 'SUCCESS',
    }

    await repo.patchRefundState(cmd.eventId, cmd.registrationId, patch)

    const updated: JsonRegistration = {
      ...existing,
      ...patch,
    }

    return { patch, previous: existing, registration: updated }
  }

export const createApplyRefundCancel =
  (repo: RegistrationRepository) =>
  async (cmd: ApplyRefundCancelCommand): Promise<ApplyRefundCancelResult> => {
    const existing = await repo.getById(cmd.eventId, cmd.registrationId)
    if (!existing) {
      throw new Error(`Registration '${cmd.registrationId}' for event '${cmd.eventId}' was not found`)
    }

    if (existing.refundStatus !== 'PENDING') {
      return { previous: existing, registration: existing }
    }

    const patch: RefundStatePatch = {
      refundAmount: existing.refundAmount,
      refundAt: existing.refundAt,
      refundStatus: 'CANCEL',
    }

    await repo.patchRefundState(cmd.eventId, cmd.registrationId, patch)

    const updated: JsonRegistration = {
      ...existing,
      refundStatus: 'CANCEL',
    }

    return { previous: existing, registration: updated }
  }

// ---------------------------------------------------------------------------
// Apply refund create (pending state)
// ---------------------------------------------------------------------------

type ApplyRefundCreateCommand = {
  eventId: string
  registrationId: string
  /** Whether the refund started as pending (true) or was immediately successful (false). */
  isPending: boolean
}

type ApplyRefundCreateResult = {
  /** The updated registration after the patch was applied. */
  registration: JsonRegistration
}

/**
 * Records the initial refund-pending state on a registration after a refund
 * has been submitted to the payment provider.
 *
 * Sets `refundStatus` to `'PENDING'` for async refunds or `'SUCCESS'` for
 * immediate email-based refunds. The handler owns all Paytrail API calls and
 * transaction writes; this action only owns the registration state transition.
 */
export const createApplyRefundCreate =
  (repo: RegistrationRepository) =>
  async (cmd: ApplyRefundCreateCommand): Promise<ApplyRefundCreateResult> => {
    const existing = await repo.getById(cmd.eventId, cmd.registrationId)
    if (!existing) {
      throw new Error(`Registration '${cmd.registrationId}' for event '${cmd.eventId}' was not found`)
    }

    const refundStatus: JsonRegistration['refundStatus'] = cmd.isPending ? 'PENDING' : 'SUCCESS'

    await repo.patchRefundState(cmd.eventId, cmd.registrationId, {
      refundAmount: existing.refundAmount,
      refundAt: existing.refundAt,
      refundStatus,
    })

    const updated: JsonRegistration = {
      ...existing,
      refundStatus,
    }

    return { registration: updated }
  }

type ApplyPaymentSuccessWithSideEffectsResult = ApplyPaymentSuccessResult & {
  event: JsonConfirmedEvent
}

const createApplyPaymentSuccessWithSideEffects =
  (
    repo: RegistrationRepository,
    deps: {
      stats: RegistrationStatsPort
      sync: SyncAggregatesPort
    }
  ) =>
  async (cmd: ApplyPaymentSuccessCommand): Promise<ApplyPaymentSuccessWithSideEffectsResult> => {
    const base = await createApplyPaymentSuccess(repo)(cmd)
    const { event } = await deps.sync.syncEventAggregates(cmd.eventId)
    await deps.stats.recordRegistrationChange({
      event,
      next: base.registration,
      previous: base.previous,
    })

    return { ...base, event }
  }

// ---------------------------------------------------------------------------
// submitRegistration — public create / update / cancel / confirm flow
// ---------------------------------------------------------------------------

type SubmitRegistrationCommand = {
  /** Raw registration payload from the public API request. */
  registration: JsonRegistration
  /** ISO-8601 timestamp for modifiedAt and createdAt fields. */
  timestamp: string
  /** Authenticated username (or 'anonymous'). */
  username: string
}

/**
 * Discriminated union describing every possible outcome.
 *
 * Handlers map each variant to an HTTP status code and, where applicable,
 * to email / audit side effects.  The action itself does NOT send emails or
 * write audit entries — those concerns belong in the handler or a future
 * `RegistrationNotifier` port.
 */
type SubmitRegistrationResult =
  | {
      kind: 'no-op'
      registration: JsonRegistration
    }
  | {
      kind: 'entry-closed'
    }
  | {
      kind: 'already-registered'
      cancelled: boolean
    }
  | {
      kind: 'created'
      registration: JsonRegistration
      event: JsonConfirmedEvent
    }
  | {
      kind: 'updated'
      /** Finer classification so the handler can choose the correct email template. */
      classification: 'cancelled' | 'confirmed' | 'invitation-read' | 'updated'
      registration: JsonRegistration
      /** Pre-mutation snapshot used by the handler for audit diffs and email context. */
      existing: JsonRegistration
      event: JsonConfirmedEvent
    }

type SubmitRegistrationDependencies = {
  eventRead: EventReadPort
  repo: RegistrationRepository
  stats: RegistrationStatsPort
  sync: SyncAggregatesPort
}

/**
 * Public registration submit action.
 *
 * Owns:
 *  - entry-open guard
 *  - duplicate-registration guard
 *  - id / timestamp assignment for new registrations
 *  - change-detection no-op guard for updates
 *  - patch-first persistence (create or patch)
 *  - canonical side-effect ordering: persist → sync aggregates → record stats
 *
 * Does NOT own emails, audit writes, or HTTP response mapping — those remain
 * in the handler until a `RegistrationNotifier` port is introduced in Phase A Step 2.
 */
export const createSubmitRegistration =
  ({ eventRead, repo, stats, sync }: SubmitRegistrationDependencies) =>
  async ({
    registration: rawInput,
    timestamp,
    username,
  }: SubmitRegistrationCommand): Promise<SubmitRegistrationResult> => {
    const event = await eventRead.getConfirmedEvent(rawInput.eventId)

    // Strip payment fields that must not be set by the public caller
    const registration: JsonRegistration = {
      ...rawInput,
      paidAmount: undefined,
      paidAt: undefined,
      paymentStatus: undefined,
    }

    const existing = registration.id ? await repo.getById(registration.eventId, registration.id) : undefined

    if (!existing) {
      if (!isEntryOpen(event)) {
        return { kind: 'entry-closed' }
      }

      // Duplicate guard — prevent two ready registrations for the same dog
      const allRegs = await repo.listByEventId(registration.eventId)
      const duplicate = allRegs.find(
        (r) => r.state === 'ready' && !r.cancelled && r.dog?.regNo === registration.dog?.regNo
      )

      if (duplicate) {
        return { cancelled: Boolean(duplicate.cancelled), kind: 'already-registered' }
      }

      const created: JsonRegistration = {
        ...registration,
        createdAt: timestamp,
        createdBy: username,
        id: registration.id || nanoid(10),
        modifiedAt: timestamp,
        modifiedBy: username,
        state: event.paymentTime === 'confirmation' ? 'ready' : 'creating',
      }

      await repo.create(created)

      // Sync aggregates and record stats after create
      const { event: updatedEvent } = await sync.syncEventAggregates(created.eventId)
      await stats.recordRegistrationChange({ event: updatedEvent, next: created, previous: undefined })

      return { event: updatedEvent, kind: 'created', registration: created }
    }

    // -----------------------------------------------------------------------
    // Update path
    // -----------------------------------------------------------------------

    const cancel = !existing.cancelled && !!registration.cancelled
    const confirm = !existing.confirmed && !!registration.confirmed && !existing.cancelled
    const invitationRead = !existing.invitationRead && !!registration.invitationRead && !existing.cancelled

    const intended: JsonRegistration = {
      ...existing,
      ...registration,
      modifiedAt: timestamp,
      modifiedBy: username,
    }

    // Change-detection no-op guard — strip technical fields before comparing
    const { modifiedAt: _ma, modifiedBy: _mb, ...existingComparable } = existing
    const { modifiedAt: _ia, modifiedBy: _ib, ...intendedComparable } = intended

    if (JSON.stringify(existingComparable) === JSON.stringify(intendedComparable)) {
      return { kind: 'no-op', registration: existing }
    }

    // Use patch-first update so only changed fields are written
    const patch = buildRegistrationPatch(existing, intended)
    if (patch) {
      await repo.patch(existing.eventId, existing.id, patch)
    }

    // Canonical side-effect ordering: persist → sync → stats
    const shouldSyncAggregates = cancel || intended.state === 'ready'
    const updatedEvent = shouldSyncAggregates ? (await sync.syncEventAggregates(intended.eventId)).event : event

    await stats.recordRegistrationChange({ event: updatedEvent, next: intended, previous: existing })

    const classification: 'cancelled' | 'confirmed' | 'invitation-read' | 'updated' = cancel
      ? 'cancelled'
      : confirm
        ? 'confirmed'
        : invitationRead
          ? 'invitation-read'
          : 'updated'

    return { classification, event: updatedEvent, existing, kind: 'updated', registration: intended }
  }

// ---------------------------------------------------------------------------
// saveAdminRegistration — admin/secretary create / update flow
// ---------------------------------------------------------------------------

type SaveAdminRegistrationCommand = {
  registration: JsonRegistration
  timestamp: string
  /** user.name from authorize() */
  username: string
}

type SaveAdminRegistrationResult =
  | { kind: 'already-registered'; cancelled: boolean }
  | {
      kind: 'saved'
      data: JsonRegistration
      existing: JsonRegistration | undefined
      confirmedEvent: JsonConfirmedEvent
    }

type SaveAdminRegistrationDependencies = {
  fixGroups: {
    fixRegistrationGroups(
      registrations: JsonRegistration[],
      user: JsonUser,
      save?: boolean
    ): Promise<JsonRegistration[]>
  }
  repo: RegistrationRepository
  stats: RegistrationStatsPort
  sync: SyncAggregatesPort
}

/**
 * Admin registration save action.
 *
 * Owns:
 *  - duplicate-registration guard (for new registrations without id)
 *  - id / timestamp assignment for new registrations (state starts as 'ready')
 *  - modifiedAt / modifiedBy always updated
 *  - patch-first persistence (create or patch)
 *  - aggregate sync
 *  - group number fixing
 *  - registration stats recording
 *
 * Does NOT own emails, audit writes, or HTTP response mapping — those remain
 * in the handler.
 */
export const createSaveAdminRegistration =
  ({ fixGroups, repo, stats, sync }: SaveAdminRegistrationDependencies) =>
  async ({ registration, timestamp, username }: SaveAdminRegistrationCommand): Promise<SaveAdminRegistrationResult> => {
    let existing: JsonRegistration | undefined

    if (!registration.id) {
      // Duplicate guard — prevent two ready registrations for the same dog
      const allRegs = await repo.listByEventId(registration.eventId)
      const found = allRegs.find((r) => r.state === 'ready' && !r.cancelled && r.dog?.regNo === registration.dog?.regNo)
      if (found) {
        return { cancelled: Boolean(found.cancelled), kind: 'already-registered' }
      }
    } else {
      existing = await repo.getById(registration.eventId, registration.id)
    }

    // For new registrations: assign id, timestamps, and state
    const idFields = registration.id
      ? {}
      : {
          createdAt: timestamp,
          createdBy: username,
          id: nanoid(10),
          state: 'ready' as const,
        }

    const modifiedAt = timestamp
    const modifiedBy = username

    const data: JsonRegistration = { ...existing, ...registration, modifiedAt, modifiedBy, ...idFields }

    if (!existing) {
      await repo.create(data)
    } else {
      const patch = buildRegistrationPatch(existing, data)
      if (patch) {
        await repo.patch(existing.eventId, existing.id, patch)
      }
    }

    // Sync aggregates
    const { event: confirmedEvent } = await sync.syncEventAggregates(data.eventId)

    // Fix group numbers for all ready registrations
    const readyRegistrations = await repo.listReadyByEventId(data.eventId)
    const user: JsonUser = { id: username, name: username } as JsonUser
    const updatedRegistrations = await fixGroups.fixRegistrationGroups(readyRegistrations, user)
    const updatedData = updatedRegistrations.find((r) => r.id === data.id) ?? data

    // Record stats
    await stats.recordRegistrationChange({ event: confirmedEvent, next: updatedData, previous: existing })

    return { confirmedEvent, data: updatedData, existing, kind: 'saved' }
  }

// ---------------------------------------------------------------------------
// updateRegistrationNotes — update internalNotes on a registration
// ---------------------------------------------------------------------------

type UpdateRegistrationNotesCommand = {
  eventId: string
  registrationId: string
  internalNotes: string | undefined
}

type UpdateRegistrationNotesResult = {
  registration: JsonRegistration
}

/**
 * Updates the `internalNotes` field on an existing registration.
 *
 * Sets `internalNotes` to the provided value, or removes it entirely when
 * `internalNotes` is `undefined`.
 */
export const createUpdateRegistrationNotes =
  (repo: RegistrationRepository) =>
  async (cmd: UpdateRegistrationNotesCommand): Promise<UpdateRegistrationNotesResult> => {
    const existing = await repo.getById(cmd.eventId, cmd.registrationId)
    if (!existing) {
      throw new Error(`Registration '${cmd.registrationId}' for event '${cmd.eventId}' was not found`)
    }
    const patch: RegistrationPatch =
      cmd.internalNotes !== undefined ? { set: { internalNotes: cmd.internalNotes } } : { remove: ['internalNotes'] }
    await repo.patch(cmd.eventId, cmd.registrationId, patch)
    return { registration: { ...existing, internalNotes: cmd.internalNotes } }
  }

// ---------------------------------------------------------------------------
// Apply group changes — admin group reorder flow
// ---------------------------------------------------------------------------

type ApplyGroupChangesCommand = {
  eventId: string
  eventGroups: JsonRegistrationGroupInfo[]
  origin: string
  user: JsonUser
}

export type ApplyGroupChangesResult = {
  confirmedEvent: JsonConfirmedEvent
  updatedItems: JsonRegistration[]
  /** Newly cancelled registrations (for handler to audit). */
  cancelledItems: JsonRegistration[]
  emails: {
    pickedOk: string[]
    pickedFailed: string[]
    invitedOk: string[]
    invitedFailed: string[]
    reserveOk: string[]
    reserveFailed: string[]
    cancelledOk: string[]
    cancelledFailed: string[]
  }
}

type ApplyGroupChangesDependencies = {
  repo: RegistrationRepository
  sync: SyncAggregatesPort
  notifier: GroupChangeNotifier
}

const isEventOrClassState = (event: JsonConfirmedEvent, cls: string | null | undefined, state: EventState): boolean =>
  Boolean(event.state === state || (cls && event.classes.some((c) => c.class === cls && c.state === state)))

const classEquals = (a: string | null | undefined, b: string | null | undefined) => (!a && !b) || a === b

const isParticipantGroup = (group?: string): boolean =>
  Boolean(group) && group !== GROUP_KEY_RESERVE && group !== GROUP_KEY_CANCELLED

/**
 * Applies admin group reorder changes: updates items in memory, saves changed
 * ones to DynamoDB, syncs event aggregates, and sends appropriate notification
 * emails to new participants, moved reserve registrations, and cancellations.
 */
export const createApplyGroupChanges =
  ({ repo, sync, notifier }: ApplyGroupChangesDependencies) =>
  async ({ eventId, eventGroups, origin, user }: ApplyGroupChangesCommand): Promise<ApplyGroupChangesResult> => {
    const oldItems = await repo.listReadyByEventId(eventId)

    // create a new copy of oldItems, so we can update without touching the originals
    const updatedItems: JsonRegistration[] = oldItems.map((r) => ({ ...r }))

    // apply in-memory group updates from eventGroups
    for (const group of eventGroups) {
      const reg = updatedItems.find((r) => r.id === group.id)
      if (reg) {
        Object.assign(reg, group)
      }
    }

    // fix numbering etc. without saving to db
    await fixRegistrationGroups(updatedItems, user, false)

    // save any items that have changed group
    for (const reg of updatedItems) {
      const oldGroup = oldItems.find((r) => r.id === reg.id)?.group
      if (reg.group?.key !== oldGroup?.key || reg.group?.number !== oldGroup?.number) {
        const reason = eventGroups.some((g) => g.id === reg.id) ? 'siirto' : 'seuraus'

        // update cancellation status so counts get right in updateRegistrations
        reg.cancelled = reg.group?.key === GROUP_KEY_CANCELLED

        await saveGroup(reg, oldGroup, user, reason, reg.cancelReason)
      }
    }

    // update event counts
    const { event: confirmedEvent } = await sync.syncEventAggregates(eventId)
    const cls = updatedItems.find((item) => item.id === eventGroups[0].id)?.class

    const oldCancelled = oldItems.filter((reg) => getRegistrationGroupKey(reg) === GROUP_KEY_CANCELLED)
    const oldResCan =
      oldItems.filter((reg) => [GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE].includes(getRegistrationGroupKey(reg))) ?? []

    const picked = isEventOrClassState(confirmedEvent, cls, 'picked')
    const invited = isEventOrClassState(confirmedEvent, cls, 'invited')

    let pickedOk: string[] = []
    let pickedFailed: string[] = []
    let invitedOk: string[] = []
    let invitedFailed: string[] = []
    let reserveOk: string[] = []
    let reserveFailed: string[] = []

    if (picked || invited) {
      /**
       * When event/class has already been 'picked' or 'invited', registrations
       * moved from reserve/cancelled to participants receive 'picked' email
       */
      const newParticipants = updatedItems.filter(
        (reg) =>
          classEquals(reg.class, cls) &&
          isParticipantGroup(reg.group?.key) &&
          oldResCan.some((old) => old.id === reg.id)
      )

      ;({ ok: pickedOk, failed: pickedFailed } = await notifier.sendPickedEmails(
        confirmedEvent,
        newParticipants,
        origin,
        user.name
      ))

      if (invited) {
        ;({ ok: invitedOk, failed: invitedFailed } = await notifier.sendInvitedEmails(
          confirmedEvent,
          newParticipants,
          origin,
          user.name
        ))
      }

      /**
       * Registrations in reserve group that moved up from previous 'reserve'
       * email notification receive an updated 'reserve' email
       */
      const movedReserve = updatedItems.filter(
        (reg) =>
          classEquals(reg.class, cls) &&
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

      ;({ ok: reserveOk, failed: reserveFailed } = await notifier.sendReserveEmails(
        confirmedEvent,
        movedReserve,
        origin,
        user.name
      ))

      await notifier.updateReserveNotified(movedReserve)
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

    const { ok: cancelledOk, failed: cancelledFailed } = await notifier.sendCancelledEmails(
      confirmedEvent,
      cancelled,
      origin,
      user.name
    )

    return {
      cancelledItems: cancelled,
      confirmedEvent,
      emails: {
        cancelledFailed,
        cancelledOk,
        invitedFailed,
        invitedOk,
        pickedFailed,
        pickedOk,
        reserveFailed,
        reserveOk,
      },
      updatedItems,
    }
  }

// ---------------------------------------------------------------------------
// Singletons wired to the concrete DynamoDB repository
// ---------------------------------------------------------------------------

import { eventReadPort, groupChangeNotifier, registrationStatsPort, syncAggregatesPort } from './api'
import { fixRegistrationGroups } from './groups'
import { registrationRepository } from './repository'

export const applyPaymentSuccessWithSideEffects = createApplyPaymentSuccessWithSideEffects(registrationRepository, {
  stats: registrationStatsPort,
  sync: syncAggregatesPort,
})
export const applyRefundSuccess = createApplyRefundSuccess(registrationRepository)
export const applyRefundCreate = createApplyRefundCreate(registrationRepository)
export const updateRegistrationNotes = createUpdateRegistrationNotes(registrationRepository)

export const submitRegistration = createSubmitRegistration({
  eventRead: eventReadPort,
  repo: registrationRepository,
  stats: registrationStatsPort,
  sync: syncAggregatesPort,
})

export const saveAdminRegistration = createSaveAdminRegistration({
  fixGroups: { fixRegistrationGroups },
  repo: registrationRepository,
  stats: registrationStatsPort,
  sync: syncAggregatesPort,
})

export const applyGroupChanges = createApplyGroupChanges({
  notifier: groupChangeNotifier,
  repo: registrationRepository,
  sync: syncAggregatesPort,
})
