import type { APIGatewayProxyEvent } from 'aws-lambda'
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
  claimNewRegistrationPostProcessing,
  clearRegistrationEmailDeliveryStatus,
  createRegistrationPatch,
  createRegistrationPatches,
  DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION,
  findExistingRegistrationToEventForDog,
  getReadyRegistrationsByEventId,
  getRegistration,
  getRegistrationChanges,
  getRegistrationEditToken,
  markNewRegistrationPhase,
  participantRegistrationResponse,
  patchRegistration,
  registrationConflictBody,
  removeNewRegistrationWorkflowMetadata,
  removeRegistrationCreationMetadata,
  saveRegistration,
} from '../lib/registration'
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

const parseAdminRegistrationRequest = (body: string | null, patchRequest: boolean) => {
  const parsed: Patch<JsonRegistration> | JsonRegistrationPatchRequest = parseJSONWithFallback(body)
  const operationRequest = patchRequest && isPatchOperationRequest(parsed) ? parsed : undefined
  if (patchRequest && isObject(parsed) && Object.hasOwn(parsed, 'operations') && !operationRequest) {
    return { invalid: 'invalid patch operations' as const }
  }
  if (!operationRequest && hasInvalidRegistrationArrayFields(parsed)) {
    return { invalid: 'registration array fields must be arrays' as const }
  }
  if (
    operationRequest &&
    (typeof operationRequest.eventId !== 'string' ||
      typeof operationRequest.id !== 'string' ||
      (operationRequest.modifiedAt !== undefined && typeof operationRequest.modifiedAt !== 'string'))
  ) {
    return { invalid: 'invalid patch metadata' as const }
  }
  const registration: Patch<JsonRegistration> = operationRequest
    ? { eventId: operationRequest.eventId, id: operationRequest.id }
    : parsed
  return { operationRequest, registration }
}

const mergeAdminRegistration = (
  existing: JsonRegistration | undefined,
  registration: Patch<JsonRegistration>,
  operationRequest: JsonRegistrationPatchRequest | undefined,
  patchRequest: boolean
): JsonRegistration => {
  if (!existing || operationRequest) return registration as JsonRegistration
  if (patchRequest) return patchMerge(existing, registration)
  return { ...existing, ...registration } as JsonRegistration
}

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

const reconcileAdminRegistrationGroups = async (registration: JsonRegistration, user: { name: string }) => {
  if (registration.state !== 'ready') return { groupPatches: [], updatedData: registration }

  const readyRegistrations = await getReadyRegistrationsByEventId(registration.eventId, true)
  const reconciliationRegistrations = [
    ...readyRegistrations.filter((item) => item.id !== registration.id),
    { ...registration, ...(registration.group ? { group: { ...registration.group } } : {}) },
  ]
  const beforeReconciliation = reconciliationRegistrations.map((item) => ({
    ...item,
    ...(item.group ? { group: { ...item.group } } : {}),
  }))
  const updatedRegistrations = await fixRegistrationGroups(reconciliationRegistrations, user)
  return {
    groupPatches: createRegistrationPatches(updatedRegistrations, beforeReconciliation),
    updatedData: {
      ...registration,
      group: updatedRegistrations.find((item) => item.id === registration.id)?.group ?? registration.group,
    },
  }
}

const persistAdminRegistration = async (
  data: JsonRegistration,
  existing: JsonRegistration | undefined,
  user: { name: string }
) => {
  const releasePaymentLock =
    !existing && data.state === 'ready' ? await lockRegistrationPayments(data.eventId) : undefined
  let releaseGroupsLock: (() => Promise<void>) | undefined
  let savedData = data
  try {
    if (releasePaymentLock) {
      const concurrent = await findExistingRegistrationToEventForDog(
        data.eventId,
        data.dog.regNo,
        data.creationIdempotencyKey,
        true
      )
      const isIdempotentRetry =
        concurrent &&
        typeof data.creationIdempotencyKey === 'string' &&
        concurrent.creationIdempotencyKey === data.creationIdempotencyKey
      if (concurrent && !isIdempotentRetry) {
        return { conflict: concurrent }
      }
      if (concurrent) savedData = concurrent
    }
    releaseGroupsLock = data.state === 'ready' ? await lockRegistrationGroups(data.eventId, 8) : undefined
    if (savedData === data) {
      if (existing) savedData = await patchRegistration(data.eventId, data.id, existing, data)
      else await saveRegistration(data)
    }
    const confirmedEvent = await updateRegistrations(savedData.eventId)
    return { ...(await reconcileAdminRegistrationGroups(savedData, user)), confirmedEvent, savedData }
  } finally {
    if (releaseGroupsLock) await releaseGroupsLock()
    if (releasePaymentLock) await releasePaymentLock()
  }
}

const handleDuplicateAdminRegistration = async (
  alreadyRegistered: JsonRegistration,
  registration: Patch<JsonRegistration>,
  user: { name: string },
  origin: string
) => {
  const groupPatches = await repairReadyRegistrationGroups(alreadyRegistered.eventId, user)
  const isIdempotentRetry =
    typeof registration.creationIdempotencyKey === 'string' &&
    registration.creationIdempotencyKey === alreadyRegistered.creationIdempotencyKey
  if (isIdempotentRetry) {
    const completed = await completeNewAdminRegistration(alreadyRegistered, user, origin, undefined, groupPatches)
    return { completed, editToken: await getRegistrationEditToken(completed) }
  }
  if (groupPatches.length) {
    const updatedEvent = await updateRegistrations(alreadyRegistered.eventId)
    await publishRegistrationPatches(alreadyRegistered.eventId, groupPatches, updatedEvent.organizer.id)
  }
  return { conflict: alreadyRegistered }
}

const prepareAdminRegistrationCreation = async (
  registration: Patch<JsonRegistration>,
  update: boolean,
  timestamp: string,
  user: { name: string },
  origin: string,
  event: APIGatewayProxyEvent
) => {
  if (update) return { registration }

  const alreadyRegistered = await findExistingRegistrationToEventForDog(
    registration.eventId ?? '',
    registration.dog?.regNo ?? '',
    registration.creationIdempotencyKey ?? undefined
  )
  if (alreadyRegistered) {
    const handled = await handleDuplicateAdminRegistration(alreadyRegistered, registration, user, origin)
    if (handled.conflict) {
      return { earlyResponse: response(409, registrationConflictBody(handled.conflict), event) }
    }
    return {
      earlyResponse: response(200, participantRegistrationResponse(handled.completed, handled.editToken), event),
    }
  }

  registration.id = nanoid(10)
  registration.editTokenVersion = DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION
  registration.createdAt = timestamp
  registration.createdBy = user.name
  registration.state = 'ready'
  return { registration }
}

const prepareAdminRegistrationUpdate = async (
  registration: Patch<JsonRegistration>,
  operationRequest: JsonRegistrationPatchRequest | undefined,
  clientModifiedAt: string | undefined
) => {
  if (!registration.id) return { registration }

  const existing = await getRegistration(registration.eventId ?? '', registration.id)
  if (existing.modifiedAt && clientModifiedAt && existing.modifiedAt !== clientModifiedAt) {
    return { conflict: 'staleData' as const, existing, registration }
  }
  if (!operationRequest) return { existing, registration }
  if (operationRequest.operations.some(({ path }) => PROTECTED_PATCH_FIELDS.has(String(path[0])))) {
    return { invalid: 'patch changes a protected registration field' as const }
  }

  let patched: JsonRegistration
  try {
    patched = applyPatchOperations(existing, operationRequest.operations)
  } catch (error) {
    if (error instanceof InvalidPatchError) return { invalid: error.message }
    throw error
  }
  if (patched.eventId !== operationRequest.eventId || patched.id !== operationRequest.id) {
    return { invalid: 'patch must not change registration identity' as const }
  }
  if (hasInvalidRegistrationArrayFields(patched, true)) {
    return { invalid: 'registration array fields must be arrays' as const }
  }
  return { existing, registration: patched }
}

interface FinalizeAdminRegistrationOptions {
  clearEmailDeliveryStatus: boolean
  confirmedEvent: JsonConfirmedEvent
  existing: JsonRegistration
  groupPatches: Patch<JsonRegistration>[]
  origin: string
  updatedData: JsonRegistration
  user: { name: string }
}

const finalizeAdminRegistrationUpdate = async ({
  clearEmailDeliveryStatus,
  confirmedEvent,
  existing,
  groupPatches,
  origin,
  updatedData,
  user,
}: FinalizeAdminRegistrationOptions) => {
  await publishRegistrationPatches(
    updatedData.eventId,
    [createRegistrationPatch(updatedData, existing), ...groupPatches.filter((patch) => patch.id !== updatedData.id)],
    confirmedEvent.organizer.id
  )
  await updateEventStatsForRegistration(updatedData, existing, confirmedEvent)
  const message = getAuditMessage(updatedData, existing)
  if (message) await audit({ auditKey: registrationAuditKey(updatedData), message, user: user.name })

  const editToken = await getRegistrationEditToken(updatedData)
  if (!updatedData.handler?.email || !updatedData.owner?.email) return editToken

  const to = emailTo(updatedData)
  const templateData = registrationEmailTemplateData(updatedData, confirmedEvent, origin, 'update', editToken)
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
  return editToken
}

const putAdminRegistrationLambda = lambda('putAdminRegistration', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const timestamp = new Date().toISOString()
  const origin = getOrigin(event)
  const patchRequest = isPatchRequest(event)

  let existing: JsonRegistration | undefined
  const request = parseAdminRegistrationRequest(event.body, patchRequest)
  if ('invalid' in request) return response(400, { message: `Bad request: ${request.invalid}` }, event)
  let { registration } = request
  const { operationRequest } = request
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
  const prepared = await prepareAdminRegistrationUpdate(registration, operationRequest, clientModifiedAt ?? undefined)
  if (prepared.conflict) {
    return response(409, { error: 'staleData', message: 'Registration has been modified since it was loaded' }, event)
  }
  if ('invalid' in prepared) return response(400, { message: `Bad request: ${prepared.invalid}` }, event)
  existing = prepared.existing
  registration = prepared.registration

  const creation = await prepareAdminRegistrationCreation(registration, update, timestamp, user, origin, event)
  if (creation.earlyResponse) return creation.earlyResponse
  registration = creation.registration

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

  const data = mergeAdminRegistration(existing, registration, operationRequest, patchRequest)
  await assertRegistrationEmailsNotSuppressed(data)
  const clearEmailDeliveryStatus = shouldClearRegistrationEmailDeliveryStatus(existing, data)
  if (clearEmailDeliveryStatus) {
    delete data.emailDeliveryStatus
  }

  const persisted = await persistAdminRegistration(data, existing, user)
  if (persisted.conflict) return response(409, registrationConflictBody(persisted.conflict), event)
  const { confirmedEvent, groupPatches, savedData, updatedData } = persisted
  if (!existing) {
    const completed = await completeNewAdminRegistration(updatedData, user, origin, confirmedEvent, groupPatches)
    const editToken = await getRegistrationEditToken(completed)
    return response(200, participantRegistrationResponse(completed, editToken), event)
  }
  const editToken = await finalizeAdminRegistrationUpdate({
    clearEmailDeliveryStatus,
    confirmedEvent,
    existing,
    groupPatches,
    origin,
    updatedData,
    user,
  })

  return response(200, participantRegistrationResponse(updatedData, editToken), event)
})

function getAuditMessage(data: JsonRegistration, existing?: JsonRegistration): string {
  if (!existing) return 'Lisäsi ilmoittautumisen'

  return getRegistrationChanges(existing, data)
}

export default putAdminRegistrationLambda
