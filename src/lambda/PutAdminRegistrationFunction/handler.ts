import type { JsonConfirmedEvent, JsonRegistration, JsonRegistrationPatchRequest, Patch } from '../../types'
import { nanoid } from 'nanoid'
import { applyPatchOperations, InvalidPatchError, isPatchOperationRequest } from '../../lib/patch'
import { hasInvalidRegistrationArrayFields } from '../../lib/registration'
import { isObject, patchMerge } from '../../lib/utils'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { audit, auditStrict, registrationAuditKey } from '../lib/audit'
import { authorizeWithMemberOf } from '../lib/auth'
import { emailTo, registrationEmailTags, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import {
  assertRegistrationEmailsNotSuppressed,
  normalizeRegistrationEmails,
  shouldClearRegistrationEmailDeliveryStatus,
} from '../lib/emailSuppression'
import {
  fixRegistrationGroups,
  lockRegistrationGroups,
  lockRegistrationPayments,
  repairReadyRegistrationGroups,
  updateRegistrations,
} from '../lib/event'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import { isPatchRequest, lambda, response } from '../lib/lambda'
import {
  clearRegistrationEmailDeliveryStatus,
  createRegistrationPatch,
  createRegistrationPatches,
  DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION,
  findExistingRegistrationToEventForDog,
  getReadyRegistrationsByEventId,
  getRegistration,
  getRegistrationChanges,
  getRegistrationEditToken,
  participantRegistrationResponse,
  patchRegistration,
  registrationConflictBody,
  saveRegistration,
} from '../lib/registration'
import { removeNewRegistrationWorkflowMetadata, removeRegistrationCreationMetadata } from '../lib/registrationMetadata'
import { claimNewRegistrationPostProcessing, markNewRegistrationPhase } from '../lib/registrationPostProcessing'
import { applyNewRegistrationStatsOnce, updateEventStatsForRegistration } from '../lib/stats'
import { publishRegistrationPatches, publishRegistrationPatchesStrict } from '../lib/ws/actions'

const { emailFrom } = CONFIG

const PROTECTED_PATCH_FIELDS = new Set([
  'createdAt',
  'createdBy',
  'creationIdempotencyKey',
  'editToken',
  'editTokenVersion',
  'eventId',
  'id',
  'modifiedAt',
  'modifiedBy',
  'newRegistrationAuditAt',
  'newRegistrationEmailSentAt',
  'newRegistrationLease',
  'newRegistrationProcessedAt',
  'newRegistrationPublishedAt',
  'newRegistrationStatsAt',
  'updatedAt',
])

const completeNewAdminRegistration = async (
  registration: JsonRegistration,
  user: { name: string },
  origin: string,
  confirmedEvent: JsonConfirmedEvent | undefined,
  groupPatches: Patch<JsonRegistration>[]
) => {
  const claim = await claimNewRegistrationPostProcessing(registration.eventId, registration.id)
  // A concurrent request with the same creation key may arrive while the
  // original request is completing these phases. Its owner will finish the
  // workflow; returning the durable registration makes the retry idempotent.
  if (!claim) return registration

  const saved = claim.registration
  try {
    if (saved.newRegistrationProcessedAt) return saved

    const event = confirmedEvent ?? (await updateRegistrations(saved.eventId))
    if (!saved.newRegistrationStatsAt) {
      await applyNewRegistrationStatsOnce(saved, event, claim.token)
    }
    if (!saved.newRegistrationAuditAt) {
      await auditStrict(
        { auditKey: registrationAuditKey(saved), message: 'Lisäsi ilmoittautumisen', user: user.name },
        saved.createdAt
      )
      await markNewRegistrationPhase(saved.eventId, saved.id, claim.token, 'newRegistrationAuditAt')
    }
    if (saved.handler?.email && saved.owner?.email && !saved.newRegistrationEmailSentAt) {
      const editToken = await getRegistrationEditToken(saved)
      const to = emailTo(saved)
      const templateData = registrationEmailTemplateData(saved, event, origin, '', editToken)
      await clearRegistrationEmailDeliveryStatus(saved.eventId, saved.id)
      await sendTemplatedMail(
        'registration',
        saved.language,
        emailFrom,
        to,
        templateData,
        registrationEmailTags(saved, 'registration')
      )
      await audit({
        auditKey: registrationAuditKey(saved),
        message: `Email: ${templateData.subject}, to: ${to.join(', ')}`,
        user: user.name,
      })
      await markNewRegistrationPhase(saved.eventId, saved.id, claim.token, 'newRegistrationEmailSentAt')
    }
    if (!saved.newRegistrationPublishedAt) {
      await publishRegistrationPatchesStrict(
        saved.eventId,
        [createRegistrationPatch(saved), ...groupPatches.filter((patch) => patch.id !== saved.id)],
        event.organizer.id
      )
      await markNewRegistrationPhase(saved.eventId, saved.id, claim.token, 'newRegistrationPublishedAt')
    }
    await markNewRegistrationPhase(saved.eventId, saved.id, claim.token, 'newRegistrationProcessedAt')
    return saved
  } finally {
    await claim.release()
  }
}

const putAdminRegistrationLambda = lambda('putAdminRegistration', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const timestamp = new Date().toISOString()
  const origin = getOrigin(event)
  const patchRequest = isPatchRequest(event)

  let existing: JsonRegistration | undefined
  const parsed: Patch<JsonRegistration> | JsonRegistrationPatchRequest = parseJSONWithFallback(event.body)
  const operationRequest = patchRequest && isPatchOperationRequest(parsed) ? parsed : undefined
  if (patchRequest && isObject(parsed) && Object.hasOwn(parsed, 'operations') && !operationRequest) {
    return response(400, { message: 'Bad request: invalid patch operations' }, event)
  }
  if (!operationRequest && hasInvalidRegistrationArrayFields(parsed)) {
    return response(400, { message: 'Bad request: registration array fields must be arrays' }, event)
  }
  if (
    operationRequest &&
    (typeof operationRequest.eventId !== 'string' ||
      typeof operationRequest.id !== 'string' ||
      (operationRequest.modifiedAt !== undefined && typeof operationRequest.modifiedAt !== 'string'))
  ) {
    return response(400, { message: 'Bad request: invalid patch metadata' }, event)
  }
  let registration: Patch<JsonRegistration> = operationRequest
    ? { eventId: operationRequest.eventId, id: operationRequest.id }
    : parsed
  const clientModifiedAt = operationRequest?.modifiedAt ?? registration.modifiedAt
  if (!operationRequest) {
    delete registration.editToken
    removeNewRegistrationWorkflowMetadata(registration)
    normalizeRegistrationEmails(registration)
  }

  if (patchRequest && (!registration.eventId || !registration.id)) {
    return response(400, { message: 'Bad request: PATCH requires eventId and id' }, event)
  }

  await getAuthorizedEvent(user, memberOf, registration.eventId ?? '')

  const update = !!registration.id
  // Creation idempotency keys authorize resuming a failed create. Preserve an
  // existing key, but never allow an update payload to replace it.
  if (update) removeRegistrationCreationMetadata(registration)
  if (update) {
    existing = await getRegistration(
      registration.eventId as JsonRegistration['eventId'],
      registration.id as JsonRegistration['id']
    )
    if (existing?.modifiedAt && clientModifiedAt && existing.modifiedAt !== clientModifiedAt) {
      return response(409, { error: 'staleData', message: 'Registration has been modified since it was loaded' }, event)
    }

    if (operationRequest) {
      if (operationRequest.operations.some(({ path }) => PROTECTED_PATCH_FIELDS.has(String(path[0])))) {
        return response(400, { message: 'Bad request: patch changes a protected registration field' }, event)
      }
      try {
        registration = applyPatchOperations(existing, operationRequest.operations)
      } catch (error) {
        if (error instanceof InvalidPatchError) {
          return response(400, { message: `Bad request: ${error.message}` }, event)
        }
        throw error
      }
      if (registration.eventId !== operationRequest.eventId || registration.id !== operationRequest.id) {
        return response(400, { message: 'Bad request: patch must not change registration identity' }, event)
      }
      if (hasInvalidRegistrationArrayFields(registration, true)) {
        return response(400, { message: 'Bad request: registration array fields must be arrays' }, event)
      }
    }
  } else {
    // Prevent double registrations when trying to insert new registration
    const alreadyRegistered = await findExistingRegistrationToEventForDog(
      registration.eventId ?? '',
      registration.dog?.regNo ?? '',
      registration.creationIdempotencyKey ?? undefined
    )

    if (alreadyRegistered) {
      // A retry may find a registration that was saved just before group
      // reconciliation failed. Repair that durable state before reporting the
      // duplicate to the administrator.
      const groupPatches = await repairReadyRegistrationGroups(alreadyRegistered.eventId, user)
      if (
        typeof registration.creationIdempotencyKey === 'string' &&
        registration.creationIdempotencyKey === alreadyRegistered.creationIdempotencyKey
      ) {
        // Reconciliation may have already persisted renumberings before the
        // original publication failed. Resume with the full ready snapshot so
        // connected admins receive every consequential group change.
        const completed = await completeNewAdminRegistration(alreadyRegistered, user, origin, undefined, groupPatches)
        const editToken = await getRegistrationEditToken(completed)
        return response(200, participantRegistrationResponse(completed, editToken), event)
      }
      if (groupPatches.length) {
        const updatedEvent = await updateRegistrations(alreadyRegistered.eventId)
        await publishRegistrationPatches(alreadyRegistered.eventId, groupPatches, updatedEvent.organizer.id)
      }
      return response(409, registrationConflictBody(alreadyRegistered), event)
    }

    registration.id = nanoid(10)
    registration.editTokenVersion = DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION
    registration.createdAt = timestamp
    registration.createdBy = user.name
    // registrations created by secretary / admin are initially ready (but unpaid)
    registration.state = 'ready'
  }

  if (operationRequest) {
    registration = {
      ...registration,
      ...(registration.handler ? { handler: { ...registration.handler } } : {}),
      ...(registration.owner ? { owner: { ...registration.owner } } : {}),
      ...(registration.payer ? { payer: { ...registration.payer } } : {}),
    }
    normalizeRegistrationEmails(registration)
  }

  // modification info is always updated
  registration.modifiedAt = timestamp
  registration.modifiedBy = user.name
  registration.updatedAt = timestamp

  let data = registration as JsonRegistration
  if (existing) {
    data = operationRequest
      ? (registration as JsonRegistration)
      : patchRequest
        ? patchMerge(existing, registration)
        : ({ ...existing, ...registration } as JsonRegistration)
  }
  await assertRegistrationEmailsNotSuppressed(data)
  const clearEmailDeliveryStatus = shouldClearRegistrationEmailDeliveryStatus(existing, data)
  if (clearEmailDeliveryStatus) {
    delete data.emailDeliveryStatus
  }

  const releasePaymentLock =
    !existing && data.state === 'ready' ? await lockRegistrationPayments(data.eventId) : undefined
  let releaseGroupsLock: (() => Promise<void>) | undefined
  let savedData = data
  let confirmedEvent: Awaited<ReturnType<typeof updateRegistrations>>
  let updatedData: JsonRegistration
  let groupPatches: ReturnType<typeof createRegistrationPatches> = []
  try {
    if (releasePaymentLock) {
      const concurrent = await findExistingRegistrationToEventForDog(
        data.eventId,
        data.dog.regNo,
        data.creationIdempotencyKey,
        true
      )
      if (concurrent) {
        if (
          typeof data.creationIdempotencyKey === 'string' &&
          concurrent.creationIdempotencyKey === data.creationIdempotencyKey
        ) {
          savedData = concurrent
        } else {
          return response(409, registrationConflictBody(concurrent), event)
        }
      }
    }
    releaseGroupsLock = data.state === 'ready' ? await lockRegistrationGroups(data.eventId, 8) : undefined
    if (savedData !== data) {
      // The request waited behind an identical create. Resume its durable row
      // after leaving the lock instead of reporting a transient conflict.
    } else if (existing) {
      savedData = await patchRegistration(data.eventId, data.id, existing, data)
    } else {
      await saveRegistration(data)
    }

    confirmedEvent = await updateRegistrations(savedData.eventId)

    if (savedData.state === 'ready') {
      // Fix group numbers for all registrations in the event (assigns group.number to newly added registrations).
      const readyRegistrations = await getReadyRegistrationsByEventId(savedData.eventId, true)
      const reconciliationRegistrations = [
        ...readyRegistrations.filter((registration) => registration.id !== savedData.id),
        { ...savedData, ...(savedData.group ? { group: { ...savedData.group } } : {}) },
      ]
      const beforeReconciliation = reconciliationRegistrations.map((registration) => ({
        ...registration,
        ...(registration.group ? { group: { ...registration.group } } : {}),
      }))
      const updatedRegistrations = await fixRegistrationGroups(reconciliationRegistrations, user)
      groupPatches = createRegistrationPatches(updatedRegistrations, beforeReconciliation)
      updatedData = {
        ...savedData,
        group: updatedRegistrations.find((registration) => registration.id === savedData.id)?.group ?? savedData.group,
      }
    } else {
      updatedData = savedData
    }
  } finally {
    if (releaseGroupsLock) await releaseGroupsLock()
    if (releasePaymentLock) await releasePaymentLock()
  }
  if (!existing) {
    const completed = await completeNewAdminRegistration(updatedData, user, origin, confirmedEvent, groupPatches)
    const editToken = await getRegistrationEditToken(completed)
    return response(200, participantRegistrationResponse(completed, editToken), event)
  }
  await publishRegistrationPatches(
    savedData.eventId,
    [createRegistrationPatch(updatedData, existing), ...groupPatches.filter((patch) => patch.id !== updatedData.id)],
    confirmedEvent.organizer.id
  )

  // Update organizer event stats after registration change
  await updateEventStatsForRegistration(updatedData, existing, confirmedEvent)

  const message = getAuditMessage(updatedData, existing)
  if (message) {
    await audit({
      auditKey: registrationAuditKey(updatedData),
      message,
      user: user.name,
    })
  }

  const context = update ? 'update' : ''
  const editToken = await getRegistrationEditToken(updatedData)
  if (updatedData.handler?.email && updatedData.owner?.email) {
    const to = emailTo(updatedData)
    const templateData = registrationEmailTemplateData(updatedData, confirmedEvent, origin, context, editToken)

    if (!clearEmailDeliveryStatus) {
      await clearRegistrationEmailDeliveryStatus(updatedData.eventId, updatedData.id)
      delete updatedData.emailDeliveryStatus
    }
    await sendTemplatedMail(
      'registration',
      updatedData.language,
      emailFrom,
      to,
      templateData,
      registrationEmailTags(updatedData, 'registration')
    )

    await audit({
      auditKey: registrationAuditKey(updatedData),
      message: `Email: ${templateData.subject}, to: ${to.join(', ')}`,
      user: user.name,
    })
  }

  return response(200, participantRegistrationResponse(updatedData, editToken), event)
})

function getAuditMessage(data: JsonRegistration, existing?: JsonRegistration): string {
  if (!existing) return 'Lisäsi ilmoittautumisen'

  return getRegistrationChanges(existing, data)
}

export default putAdminRegistrationLambda
