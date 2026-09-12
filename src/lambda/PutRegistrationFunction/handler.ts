import type { AuditActor } from '../../lib/audit'
import type { JsonConfirmedEvent, JsonRegistration, JsonRegistrationPatchRequest, Patch } from '../../types'
import { isEntryOpen, isEventOver } from '../../lib/event'
import { InvalidPatchError } from '../../lib/patch'
import { qualifyJsonRegistration } from '../../lib/qualification'
import {
  isCompleteRegistration,
  isPublicRegistrationOperationField,
  registrationActor,
  resolveInvitationRead,
} from '../../lib/registration'
import { registrationBodySchema } from '../../lib/schema/registration'
import { patchMerge } from '../../lib/utils'
import { getFrontendOrigin } from '../lib/api-gw'
import { authorize } from '../lib/auth'
import { readOfficialResults } from '../lib/dog'
import {
  assertRegistrationEmailsNotSuppressed,
  normalizeRegistrationEmails,
  shouldClearRegistrationEmailDeliveryStatus,
} from '../lib/emailSuppression'
import { getEvent } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, isPatchRequest, lambda, response } from '../lib/lambda'
import {
  applyOwnerOverrides,
  authorizeRegistrationEdit,
  findExistingRegistrationToEventForDog,
  getRegistration,
  getRegistrationEditToken,
  hasRegistrationChanges,
  participantRegistrationResponse,
  publicRegistrationPatch,
  registrationConflictBody,
} from '../lib/registration'
import { persistRegistrationWithGroups } from '../lib/registrationPersistence'
import {
  applyRegistrationPatchRequest,
  completeNewRegistration,
  finalizeRegistrationUpdate,
  initializeNewRegistration,
  parseRegistrationRequest,
  resolveDuplicateRegistration,
} from '../lib/registrationWorkflow'
import { validateBody } from '../lib/request'

/** What the participant's own audit trail says of a registration they made. */
const CREATED_AUDIT_MESSAGE = 'Ilmoittautui'

const getData = async (registration: Patch<JsonRegistration>) => {
  const eventId = typeof registration.eventId === 'string' ? registration.eventId : ''
  const id = typeof registration.id === 'string' ? registration.id : undefined
  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)
  const existing = id ? await getRegistration(eventId, id) : undefined

  return { confirmedEvent, existing }
}

/** The stored registration with the participant's operations applied, only to the fields a participant may edit. */
const applyPublicPatchRequest = (
  existing: JsonRegistration,
  operationRequest: JsonRegistrationPatchRequest
): Patch<JsonRegistration> => {
  try {
    const patched = applyRegistrationPatchRequest(existing, operationRequest, isPublicRegistrationOperationField)
    return publicRegistrationPatch(patched, true)
  } catch (error) {
    if (error instanceof InvalidPatchError) throw httpError(400, { message: `Bad request: ${error.message}` })
    throw error
  }
}

/**
 * The registration to store and what the participant's request did to it: an edit of the details,
 * a cancellation, a confirmation, or the reading of an invitation. The one-way flags only count on
 * the way up; `publicRegistrationPatch` has already dropped any attempt to clear them.
 */
const buildPublicRegistrationData = (
  registration: Patch<JsonRegistration>,
  existing: JsonRegistration | undefined,
  confirmedEvent: JsonConfirmedEvent
) => {
  const cancel = !existing?.cancelled && Boolean(registration.cancelled)
  const confirm = !existing?.confirmed && Boolean(registration.confirmed) && !existing?.cancelled
  const invitation = existing
    ? resolveInvitationRead(confirmedEvent, existing, registration.invitationRead ?? undefined)
    : { read: false }

  let data: JsonRegistration
  if (existing) data = patchMerge(existing, registration)
  else {
    // Decided below from the dog's official results, once the body is known to be whole.
    registration.qualifies = false
    registration.qualifyingResults = []
    if (!isCompleteRegistration(registration)) {
      throw httpError(400, { message: 'Bad request: registration data is incomplete' })
    }
    data = registration
  }
  if (invitation.attachment) data.invitationAttachmentRead = invitation.attachment

  return { data, flags: { cancel, confirm, invitation: invitation.read } }
}

const putRegistrationLambda = lambda('putRegistration', async (event) => {
  const timestamp = new Date().toISOString()
  const linkOrigin = getFrontendOrigin(event)
  const patchRequest = isPatchRequest(event)

  const body: Patch<JsonRegistration> | JsonRegistrationPatchRequest = parseJSONWithFallback(event.body)
  validateBody(registrationBodySchema, body)

  const request = parseRegistrationRequest(body, patchRequest)
  if ('invalid' in request) throw httpError(400, { message: `Bad request: ${request.invalid}` })
  const { operationRequest } = request
  let registration = operationRequest
    ? request.registration
    : normalizeRegistrationEmails(publicRegistrationPatch(request.registration, Boolean(request.registration.id)))

  if (patchRequest && (!registration.eventId || !registration.id)) {
    throw httpError(400, { message: 'Bad request: PATCH requires eventId and id' })
  }

  const { confirmedEvent, existing } = await getData(registration)
  if (!confirmedEvent || isEventOver(confirmedEvent)) {
    throw httpError(404, { message: 'Not found' })
  }

  if (existing) {
    await authorizeRegistrationEdit(event, existing)
    if (operationRequest) registration = applyPublicPatchRequest(existing, operationRequest)
  }

  // On the logged-in route the authorizer names the participant (KOE-1418); on the public one the
  // audit rows and the created/modified stamps carry the name of the person the registration says
  // is paying, and say so (KOE-1417).
  const user: AuditActor =
    (await authorize(event)) ?? registrationActor(existing ? patchMerge(existing, registration) : registration)

  if (!existing) {
    if (!isEntryOpen(confirmedEvent)) {
      throw httpError(410, { message: 'Gone: Entry is not open' })
    }
    const duplicate = await findExistingRegistrationToEventForDog(
      registration.eventId ?? '',
      registration.dog?.regNo ?? '',
      registration.creationIdempotencyKey ?? undefined
    )
    if (duplicate) {
      const resolved = await resolveDuplicateRegistration({
        auditMessage: CREATED_AUDIT_MESSAGE,
        confirmedEvent,
        duplicate,
        origin: linkOrigin,
        registration,
        user,
      })
      if ('conflict' in resolved) throw httpError(409, registrationConflictBody(resolved.conflict))
      return response(200, participantRegistrationResponse(resolved.completed, resolved.editToken), event)
    }
    initializeNewRegistration(
      registration,
      timestamp,
      user,
      confirmedEvent.paymentTime === 'confirmation' ? 'ready' : 'creating'
    )
  }

  // modification info is always updated
  registration.modifiedAt = timestamp
  registration.modifiedBy = user.name
  registration.updatedAt = timestamp

  const { data, flags } = buildPublicRegistrationData(registration, existing, confirmedEvent)

  applyOwnerOverrides(data)
  // The official results come from the dog table, not from the request's copy of them: a client
  // can write anything into its copy, and the eligibility rests on these (KOE-1346). The manual
  // results stay what they are, the owner's own claims, and are stored and shown as such.
  data.dog.results = await readOfficialResults(data.dog.regNo)
  Object.assign(data, qualifyJsonRegistration(data, confirmedEvent))

  if (existing && !hasRegistrationChanges(existing, data)) {
    return response(304, undefined, event)
  }

  await assertRegistrationEmailsNotSuppressed(data, existing)

  if (shouldClearRegistrationEmailDeliveryStatus(existing, data)) {
    delete data.emailDeliveryStatus
  }

  const persisted = await persistRegistrationWithGroups(data, existing, user)
  if (persisted.kind === 'conflict') {
    throw httpError(409, registrationConflictBody(persisted.conflict))
  }
  const { groupPatches, savedData } = persisted
  if (!existing) {
    const completed = await completeNewRegistration({
      auditMessage: CREATED_AUDIT_MESSAGE,
      confirmedEvent,
      groupPatches,
      origin: linkOrigin,
      registration: savedData,
      user,
    })
    return response(200, participantRegistrationResponse(completed, await getRegistrationEditToken(completed)), event)
  }

  await finalizeRegistrationUpdate({ existing, flags, groupPatches, origin: linkOrigin, registration: savedData, user })

  return response(200, participantRegistrationResponse(savedData, await getRegistrationEditToken(savedData)), event)
})

export default putRegistrationLambda
