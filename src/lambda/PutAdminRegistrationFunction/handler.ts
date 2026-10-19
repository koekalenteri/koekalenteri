import type { JsonConfirmedEvent, JsonRegistration, JsonRegistrationPatchRequest, Patch } from '../../types'
import { registrationAddedAudit } from '../../lib/audit'
import { InvalidPatchError } from '../../lib/patch'
import {
  hasInvalidRegistrationArrayFields,
  REGISTRATION_MONEY_FIELDS,
  withoutRegistrationMoney,
} from '../../lib/registration'
import { patchMerge } from '../../lib/utils'
import { getOrigin } from '../lib/api-gw'
import { authorizeWithMemberOf } from '../lib/auth'
import {
  assertRegistrationEmailsNotSuppressed,
  normalizeRegistrationEmails,
  shouldClearRegistrationEmailDeliveryStatus,
} from '../lib/emailSuppression'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, isPatchRequest, lambda, response } from '../lib/lambda'
import {
  adminRegistrationResponse,
  applyOwnerOverrides,
  getRegistration,
  getRegistrationEditToken,
  registrationConflictBody,
  removeNewRegistrationWorkflowMetadata,
  removeRegistrationCreationMetadata,
} from '../lib/registration'
import { persistRegistrationWithGroups } from '../lib/registrationPersistence'
import {
  applyRegistrationPatchRequest,
  completeDuplicateRegistration,
  completeNewRegistration,
  finalizeRegistrationUpdate,
  initializeNewRegistration,
  parseRegistrationRequest,
} from '../lib/registrationWorkflow'

/** What the audit trail says of a registration an organizer made. */
const CREATED_AUDIT_MESSAGE = registrationAddedAudit()

const PROTECTED_PATCH_FIELDS = new Set([
  'createdAt',
  'createdBy',
  'creationIdempotencyKey',
  'editToken',
  'editTokenVersion',
  'eventId',
  // Results are written by the results endpoints and the sending to Kennelliitto, which know the
  // lock; a registration form carries a copy that is old by the time it is saved (KOE-1140).
  'eventResult',
  'id',
  'kcResult',
  'modifiedAt',
  'modifiedBy',
  'newRegistrationAuditAt',
  'newRegistrationEmailSentAt',
  'newRegistrationLease',
  'newRegistrationProcessedAt',
  'newRegistrationPublishedAt',
  'newRegistrationStatsAt',
  'updatedAt',
  // Written only with the payment or refund they come from (KOE-1531).
  ...REGISTRATION_MONEY_FIELDS,
])

const isAdminEditableField = (field: unknown) => !PROTECTED_PATCH_FIELDS.has(String(field))

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

/**
 * The stored registration an edit is of, and the edit applied when it came as operations. An edit
 * of a registration someone else saved since the client loaded it is refused rather than merged.
 */
const prepareAdminRegistrationUpdate = async (
  registration: Patch<JsonRegistration>,
  operationRequest: JsonRegistrationPatchRequest | undefined,
  clientModifiedAt: string | undefined
) => {
  if (!registration.id) return { registration }

  const existing = await getRegistration(registration.eventId ?? '', registration.id)
  if (existing.modifiedAt && clientModifiedAt && existing.modifiedAt !== clientModifiedAt) {
    throw httpError(409, { error: 'staleData', message: 'Registration has been modified since it was loaded' })
  }
  if (!operationRequest) return { existing, registration }

  try {
    return { existing, registration: applyRegistrationPatchRequest(existing, operationRequest, isAdminEditableField) }
  } catch (error) {
    if (error instanceof InvalidPatchError) throw httpError(400, { message: `Bad request: ${error.message}` })
    throw error
  }
}

const putAdminRegistrationLambda = lambda('putAdminRegistration', async (event) => {
  const { user, memberOf } = await authorizeWithMemberOf(event)

  const timestamp = new Date().toISOString()
  const origin = getOrigin(event)
  const patchRequest = isPatchRequest(event)

  const request = parseRegistrationRequest(parseJSONWithFallback(event.body), patchRequest)
  if ('invalid' in request) throw httpError(400, { message: `Bad request: ${request.invalid}` })
  const { operationRequest } = request
  // The money is the payment and refund transactions' to write, and a form's copy of it is as old as
  // the form: a full save or a merge keeps what is stored, and a new registration starts with none.
  // Money writes move only `updatedAt`, which the stale check below does not compare (KOE-1531).
  let registration = operationRequest ? request.registration : withoutRegistrationMoney(request.registration)
  if (!operationRequest && hasInvalidRegistrationArrayFields(registration)) {
    throw httpError(400, { message: 'Bad request: registration array fields must be arrays' })
  }
  const clientModifiedAt = operationRequest?.modifiedAt ?? registration.modifiedAt
  if (!operationRequest) {
    delete registration.editToken
    delete registration.eventResult
    delete registration.kcResult
    removeNewRegistrationWorkflowMetadata(registration)
    normalizeRegistrationEmails(registration)
  }

  if (patchRequest && (!registration.eventId || !registration.id)) {
    throw httpError(400, { message: 'Bad request: PATCH requires eventId and id' })
  }

  const confirmedEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, registration.eventId ?? '')

  const update = !!registration.id
  // Creation idempotency keys authorize resuming a failed create. Preserve an
  // existing key, but never allow an update payload to replace it.
  if (update) removeRegistrationCreationMetadata(registration)
  const prepared = await prepareAdminRegistrationUpdate(registration, operationRequest, clientModifiedAt ?? undefined)
  const existing = prepared.existing
  registration = prepared.registration

  if (!update) {
    const retried = await completeDuplicateRegistration({
      auditMessage: CREATED_AUDIT_MESSAGE,
      confirmedEvent,
      origin,
      registration,
      user,
    })
    if (retried) return response(200, adminRegistrationResponse(retried.completed, retried.editToken), event)
    initializeNewRegistration(registration, timestamp, user, 'ready')
  }

  // modification info is always updated
  registration.modifiedAt = timestamp
  registration.modifiedBy = user.name
  registration.updatedAt = timestamp

  const data = mergeAdminRegistration(existing, registration, operationRequest, patchRequest)
  applyOwnerOverrides(data)
  await assertRegistrationEmailsNotSuppressed(data, existing)
  if (shouldClearRegistrationEmailDeliveryStatus(existing, data)) {
    delete data.emailDeliveryStatus
  }

  const persisted = await persistRegistrationWithGroups(data, existing, user)
  if (persisted.kind === 'conflict') throw httpError(409, registrationConflictBody(persisted.conflict))
  const { groupPatches, savedData } = persisted
  if (!existing) {
    const completed = await completeNewRegistration({
      auditMessage: CREATED_AUDIT_MESSAGE,
      confirmedEvent,
      groupPatches,
      origin,
      registration: savedData,
      user,
    })
    return response(200, adminRegistrationResponse(completed, getRegistrationEditToken(completed)), event)
  }

  await finalizeRegistrationUpdate({ existing, groupPatches, origin, registration: savedData, user })

  return response(200, adminRegistrationResponse(savedData, getRegistrationEditToken(savedData)), event)
})

export default putAdminRegistrationLambda
