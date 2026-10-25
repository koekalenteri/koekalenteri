import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { AuditActor } from '../../lib/audit'
import type { ParticipantFieldLocks } from '../../lib/registrationLocks'
import type { JsonConfirmedEvent, JsonRegistration, JsonRegistrationPatchRequest, Patch } from '../../types'
import { registrationCreatedAudit } from '../../lib/audit'
import { isEntryOpen, isEventOver } from '../../lib/event'
import { InvalidPatchError } from '../../lib/patch'
import { qualifyJsonRegistration } from '../../lib/qualification'
import {
  isCompleteRegistration,
  isPublicRegistrationOperationField,
  isRegistrationCancelClosed,
  isRegistrationContentLocked,
  meetsRestrictions,
  registrationActor,
  resolveInvitationRead,
  withoutParticipantResponses,
} from '../../lib/registration'
import {
  getParticipantFieldLocks,
  isEntryRestrictionLocked,
  NO_PARTICIPANT_FIELD_LOCKS,
  participantLockedChange,
} from '../../lib/registrationLocks'
import { registrationBodySchema } from '../../lib/schema/registration'
import { legacyRegistrationDays, rekeyRegistrationDays } from '../../lib/storedDays'
import { patchMerge } from '../../lib/utils'
import { getFrontendOrigin } from '../lib/api-gw'
import { authorize } from '../lib/auth'
import {
  assertRegistrationEmailsNotSuppressed,
  normalizeRegistrationEmails,
  shouldClearRegistrationEmailDeliveryStatus,
} from '../lib/emailSuppression'
import { getLiveEvent } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, isPatchRequest, lambda, response } from '../lib/lambda'
import { participantResponse } from '../lib/payment'
import {
  applyOwnerOverrides,
  authorizeRegistrationEdit,
  getRegistration,
  getRegistrationEditToken,
  hasRegistrationChanges,
  publicRegistrationPatch,
  registrationConflictBody,
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
import { readOfficialResults } from '../lib/repositories/dogRepository'
import { validateBody } from '../lib/request'

/** What the participant's own audit trail says of a registration they made. */
const CREATED_AUDIT_MESSAGE = registrationCreatedAudit()

const getData = async (registration: Patch<JsonRegistration>) => {
  const eventId = typeof registration.eventId === 'string' ? registration.eventId : ''
  const id = typeof registration.id === 'string' ? registration.id : undefined
  const confirmedEvent = await getLiveEvent<JsonConfirmedEvent>(eventId)
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

/**
 * Refuses a change to what an existing entry says once that has closed for the participant, by the
 * rule their edit form reads (`isRegistrationContentLocked`, KOE-1584): from the close of entry to
 * the trial, and once the entry's class has been judged. A new registration has its own gate
 * (`isEntryOpen`) and passes here.
 *
 * Confirming, cancelling and reading an invitation are not edits of the entry. A request that
 * changes only those passes here, also after the class has been judged, until the trial is over
 * (`isEventOver`, the 404 above); one that changes anything else besides them is refused. Refusing an
 * invitation read would strand RegistrationInvitation's loader and the list page's `?invitation`
 * redirect, which only log a failed read and never navigate on. A cancellation has its own, earlier
 * close (`assertCancellationOpen`).
 */
const assertEntryContentEditable = (
  existing: JsonRegistration | undefined,
  data: JsonRegistration,
  confirmedEvent: JsonConfirmedEvent
) => {
  if (!existing || !isRegistrationContentLocked(confirmedEvent, existing)) return
  if (hasRegistrationChanges(withoutParticipantResponses(existing), withoutParticipantResponses(data))) {
    throw httpError(410, { message: 'Gone: the entry can no longer be edited' })
  }
}

/**
 * Refuses the participant's cancellation of an existing entry from the Finnish day before the trial,
 * by the rule the list page offers it by (`isRegistrationCancelClosed`, KOE-1590): from then on the dog
 * is expected, and only the secretary takes it off the list (PutAdminRegistration). The same holds
 * whether the cancellation comes as the operations or as the whole registration.
 */
const assertCancellationOpen = (
  existing: JsonRegistration | undefined,
  cancel: boolean,
  confirmedEvent: JsonConfirmedEvent
) => {
  if (!existing || !cancel || !isRegistrationCancelClosed(confirmedEvent, existing)) return
  throw httpError(410, { message: 'Gone: the entry can no longer be cancelled' })
}

/**
 * Refuses a change to a part of the entry that has closed for the participant, by the rule their
 * form locks its sections by (`getParticipantFieldLocks`, KOE-1588): the class and the days once
 * picked or once the entry has closed, the dog once picked or paid, the people and the manual results
 * once picked, the memberships and the costs once paid. It compares before the server writes its own
 * fields (the official results, the days as keys, the qualification), and with the addresses
 * normalized on both sides, so a resend of what is stored passes. The notes and the payer stay open.
 */
const assertParticipantFieldsUnlocked = (
  existing: JsonRegistration | undefined,
  data: JsonRegistration,
  locks: ParticipantFieldLocks
) => {
  if (!existing) return
  const section = participantLockedChange(
    locks,
    normalizeRegistrationEmails(structuredClone(existing)),
    normalizeRegistrationEmails(structuredClone(data))
  )
  if (section) throw httpError(410, { message: `Gone: the ${section} section can no longer be changed` })
}

/**
 * The entry restrictions (KOE-525) are a gate, not a note to the secretary: the form does not let an
 * entry through without a membership or a named breed, and neither does the API. A cancellation or a
 * confirmation is not an entry and passes, and so does an entry whose sections that could still meet
 * the restriction are locked for the participant (`isEntryRestrictionLocked`, KOE-1588).
 */
const assertMeetsRestrictions = (
  data: JsonRegistration,
  confirmedEvent: JsonConfirmedEvent,
  locks: ParticipantFieldLocks,
  operationRequest: boolean
) => {
  if (operationRequest || isEntryRestrictionLocked(confirmedEvent, locks)) return
  if (!meetsRestrictions(confirmedEvent, data)) {
    throw httpError(400, { message: 'Bad request: the entry is restricted to members or named breeds' })
  }
}

/** The request body as the registration to store, or as the operations to apply to a stored one. */
const parsePublicRegistrationBody = (event: APIGatewayProxyEvent) => {
  const patchRequest = isPatchRequest(event)
  const body: Patch<JsonRegistration> | JsonRegistrationPatchRequest = parseJSONWithFallback(event.body)
  validateBody(registrationBodySchema, body)

  const request = parseRegistrationRequest(body, patchRequest)
  if ('invalid' in request) throw httpError(400, { message: `Bad request: ${request.invalid}` })
  const { operationRequest } = request
  const registration = operationRequest
    ? request.registration
    : normalizeRegistrationEmails(publicRegistrationPatch(request.registration, Boolean(request.registration.id)))

  if (patchRequest && (!registration.eventId || !registration.id)) {
    throw httpError(400, { message: 'Bad request: PATCH requires eventId and id' })
  }

  return { operationRequest, registration }
}

/**
 * A registration for a dog the event does not have yet: refused while entry is closed, completed
 * when it is the retry of a creation that did not finish, and otherwise started. The completed
 * retry is returned; a started registration is initialized in place.
 */
const startNewRegistration = async (
  registration: Patch<JsonRegistration>,
  confirmedEvent: JsonConfirmedEvent,
  user: AuditActor,
  origin: string,
  timestamp: string
) => {
  if (!isEntryOpen(confirmedEvent)) {
    throw httpError(410, { message: 'Gone: Entry is not open' })
  }
  const retried = await completeDuplicateRegistration({
    auditMessage: CREATED_AUDIT_MESSAGE,
    confirmedEvent,
    origin,
    registration,
    user,
  })
  if (retried) return retried

  initializeNewRegistration(
    registration,
    timestamp,
    user,
    confirmedEvent.paymentTime === 'confirmation' ? 'ready' : 'creating'
  )
  return undefined
}

const putRegistrationLambda = lambda('putRegistration', async (event) => {
  const timestamp = new Date().toISOString()
  const linkOrigin = getFrontendOrigin(event)
  const { operationRequest, registration: requested } = parsePublicRegistrationBody(event)
  let registration = requested

  const { confirmedEvent, existing } = await getData(registration)
  if (!confirmedEvent || isEventOver(confirmedEvent)) {
    throw httpError(404, { message: 'Not found' })
  }

  if (existing) {
    authorizeRegistrationEdit(event, existing)
    if (operationRequest) registration = applyPublicPatchRequest(existing, operationRequest)
  }

  // On the logged-in route the authorizer names the participant (KOE-1418); on the public one the
  // audit rows and the created/modified stamps carry the name of the person the registration says
  // is paying, and say so (KOE-1417).
  const user: AuditActor =
    (await authorize(event)) ?? registrationActor(existing ? patchMerge(existing, registration) : registration)

  if (!existing) {
    const retried = await startNewRegistration(registration, confirmedEvent, user, linkOrigin, timestamp)
    if (retried) {
      return response(200, await participantResponse(retried.completed, retried.editToken, confirmedEvent), event)
    }
  }

  // modification info is always updated
  registration.modifiedAt = timestamp
  registration.modifiedBy = user.name
  registration.updatedAt = timestamp

  const { data, flags } = buildPublicRegistrationData(registration, existing, confirmedEvent)
  assertEntryContentEditable(existing, data, confirmedEvent)
  assertCancellationOpen(existing, flags.cancel, confirmedEvent)
  const locks = existing ? getParticipantFieldLocks(confirmedEvent, existing) : NO_PARTICIPANT_FIELD_LOCKS
  assertParticipantFieldsUnlocked(existing, data, locks)

  applyOwnerOverrides(data)
  assertMeetsRestrictions(data, confirmedEvent, locks, Boolean(operationRequest))
  // The official results come from the dog table, not from the request's copy of them: a client
  // can write anything into its copy, and the eligibility rests on these (KOE-1346). The manual
  // results stay what they are, the owner's own claims, and are stored and shown as such.
  data.dog.results = await readOfficialResults(data.dog.regNo)
  // Days are stored as keys (KOE-1547): a browser loaded before that sends instants, and the dog row
  // the official results come from may not be migrated yet.
  rekeyRegistrationDays(data, legacyRegistrationDays)
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
    return response(
      200,
      await participantResponse(completed, getRegistrationEditToken(completed), confirmedEvent),
      event
    )
  }

  await finalizeRegistrationUpdate({ existing, flags, groupPatches, origin: linkOrigin, registration: savedData, user })

  return response(200, await participantResponse(savedData, getRegistrationEditToken(savedData), confirmedEvent), event)
})

export default putRegistrationLambda
