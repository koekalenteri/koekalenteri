import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonConfirmedEvent, JsonRegistration, JsonRegistrationPatchRequest, JsonUser, Patch } from '../../types'
import { registrationAddedAudit } from '../../lib/audit'
import { InvalidPatchError } from '../../lib/patch'
import {
  hasInvalidRegistrationArrayFields,
  isAdminRegistrationOperationField,
  withoutRegistrationMoney,
} from '../../lib/registration'
import { rekeyRegistrationDays, storedRegistrationDays } from '../../lib/storedDays'
import { getOrigin } from '../lib/api-gw'
import { authorizeWithMemberOf } from '../lib/auth'
import { refuseDaysAwaitingMigration } from '../lib/dayMigration'
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

interface AdminRegistrationRequest {
  event: APIGatewayProxyEvent
  memberOf: string[]
  origin: string
  timestamp: string
  user: JsonUser
}

/**
 * The stored registration with the operations applied. An edit of a registration someone else saved
 * since the client loaded it is refused rather than merged.
 */
const applyAdminRegistrationOperations = async (operationRequest: JsonRegistrationPatchRequest) => {
  const existing = await getRegistration(operationRequest.eventId, operationRequest.id)
  const clientModifiedAt = operationRequest.modifiedAt
  if (existing.modifiedAt && clientModifiedAt && existing.modifiedAt !== clientModifiedAt) {
    throw httpError(409, { error: 'staleData', message: 'Registration has been modified since it was loaded' })
  }

  try {
    return {
      data: applyRegistrationPatchRequest(existing, operationRequest, isAdminRegistrationOperationField),
      existing,
    }
  } catch (error) {
    if (error instanceof InvalidPatchError) throw httpError(400, { message: `Bad request: ${error.message}` })
    throw error
  }
}

/** Stamps the edit, checks the addresses and writes the registration with its group. */
const saveAdminRegistration = async (
  data: JsonRegistration,
  existing: JsonRegistration | undefined,
  { timestamp, user }: AdminRegistrationRequest
) => {
  // Days are stored as keys (KOE-1547); a browser loaded before that sends instants.
  rekeyRegistrationDays(data, storedRegistrationDays)
  data.modifiedAt = timestamp
  data.modifiedBy = user.name
  data.updatedAt = timestamp
  applyOwnerOverrides(data)
  await assertRegistrationEmailsNotSuppressed(data, existing)
  if (shouldClearRegistrationEmailDeliveryStatus(existing, data)) {
    delete data.emailDeliveryStatus
  }

  const persisted = await persistRegistrationWithGroups(data, existing, user)
  if (persisted.kind === 'conflict') throw httpError(409, registrationConflictBody(persisted.conflict))
  return persisted
}

/** A secretary's edit of a stored registration, which arrives as patch operations. */
const updateAdminRegistration = async (
  operationRequest: JsonRegistrationPatchRequest,
  request: AdminRegistrationRequest
) => {
  const { event, memberOf, origin, user } = request
  if (!operationRequest.eventId || !operationRequest.id) {
    throw httpError(400, { message: 'Bad request: PATCH requires eventId and id' })
  }
  const confirmedEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, operationRequest.eventId)

  const { data, existing } = await applyAdminRegistrationOperations(operationRequest)
  refuseDaysAwaitingMigration({ event: confirmedEvent, registrations: [existing] })
  const { groupPatches, savedData } = await saveAdminRegistration(data, existing, request)

  await finalizeRegistrationUpdate({ existing, groupPatches, origin, registration: savedData, user })

  return response(200, adminRegistrationResponse(savedData, getRegistrationEditToken(savedData)), event)
}

/** A registration a secretary enters for an entrant, or a retry of one whose creation failed. */
const createAdminRegistration = async (body: Patch<JsonRegistration>, request: AdminRegistrationRequest) => {
  const { event, memberOf, origin, timestamp, user } = request
  // The money is the payment and refund transactions' to write, and a new registration starts with
  // none, whatever the form carries (KOE-1531).
  const registration = withoutRegistrationMoney(body)
  if (hasInvalidRegistrationArrayFields(registration)) {
    throw httpError(400, { message: 'Bad request: registration array fields must be arrays' })
  }
  delete registration.editToken
  delete registration.eventResult
  delete registration.kcResult
  removeNewRegistrationWorkflowMetadata(registration)
  normalizeRegistrationEmails(registration)

  const confirmedEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, registration.eventId ?? '')
  refuseDaysAwaitingMigration({ event: confirmedEvent })

  const retried = await completeDuplicateRegistration({
    auditMessage: CREATED_AUDIT_MESSAGE,
    confirmedEvent,
    origin,
    registration,
    user,
  })
  if (retried) return response(200, adminRegistrationResponse(retried.completed, retried.editToken), event)
  initializeNewRegistration(registration, timestamp, user, 'ready')

  // The body is the whole registration the form built, now with the identity and the creation
  // fields initializeNewRegistration gave it; nothing stored is merged into a new one.
  const persisted = await saveAdminRegistration(registration as JsonRegistration, undefined, request)
  const completed = await completeNewRegistration({
    auditMessage: CREATED_AUDIT_MESSAGE,
    confirmedEvent,
    groupPatches: persisted.groupPatches,
    origin,
    registration: persisted.savedData,
    user,
  })
  return response(200, adminRegistrationResponse(completed, getRegistrationEditToken(completed)), event)
}

/**
 * A registration without an id is a new one. A stored registration changes only through patch
 * operations: a whole copy, or a merge of one, read before a payment was applied would put back the
 * state and the confirmation the payment set, since the stale check compares `modifiedAt` and a
 * payment moves only `updatedAt` (KOE-1575).
 */
const putAdminRegistrationLambda = lambda('putAdminRegistration', async (event) => {
  const { user, memberOf } = await authorizeWithMemberOf(event)
  const patchRequest = isPatchRequest(event)

  const request = parseRegistrationRequest(parseJSONWithFallback(event.body), patchRequest)
  if ('invalid' in request) throw httpError(400, { message: `Bad request: ${request.invalid}` })

  const context = { event, memberOf, origin: getOrigin(event), timestamp: new Date().toISOString(), user }
  if (request.operationRequest) return updateAdminRegistration(request.operationRequest, context)
  if (patchRequest) throw httpError(400, { message: 'Bad request: PATCH requires patch operations' })
  if (request.registration.id) {
    throw httpError(400, { message: 'Bad request: an existing registration is changed only with patch operations' })
  }
  return createAdminRegistration(request.registration, context)
})

export default putAdminRegistrationLambda
