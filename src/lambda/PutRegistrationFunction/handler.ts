import type {
  EmailTemplateId,
  JsonConfirmedEvent,
  JsonRegistration,
  JsonRegistrationPatchRequest,
  JsonTestResult,
  ManualTestResult,
  Patch,
  RegistrationTemplateContext,
  TestResult,
} from '../../types'
import { nanoid } from 'nanoid'
import { applyPatchOperations, InvalidPatchError, isPatchOperationRequest } from '../../lib/patch'
import { filterRelevantResults } from '../../lib/qualification'
import {
  GROUP_KEY_RESERVE,
  getSentInvitationAttachment,
  hasInvalidRegistrationArrayFields,
  isParticipantGroup,
  isPublicRegistrationOperationField,
} from '../../lib/registration'
import { isEntryOpen, isEventOver, isObject, patchMerge } from '../../lib/utils'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { audit, auditStrict, registrationAuditKey } from '../lib/audit'
import { getUsername } from '../lib/auth'
import { emailTo, registrationEmailTags, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import {
  assertRegistrationEmailsNotSuppressed,
  normalizeRegistrationEmails,
  shouldClearRegistrationEmailDeliveryStatus,
} from '../lib/emailSuppression'
import {
  fixRegistrationGroups,
  getEvent,
  lockRegistrationGroups,
  lockRegistrationPayments,
  repairReadyRegistrationGroups,
  updateRegistrations,
} from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { isPatchRequest, lambda, response } from '../lib/lambda'
import {
  authorizeRegistrationEdit,
  clearRegistrationEmailDeliveryStatus,
  createRegistrationPatch,
  createRegistrationPatches,
  DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION,
  findExistingRegistrationToEventForDog,
  getCancelAuditMessage,
  getReadyRegistrationsByEventId,
  getRegistration,
  getRegistrationChanges,
  getRegistrationEditToken,
  hasRegistrationChanges,
  participantRegistrationResponse,
  patchRegistration,
  publicRegistrationPatch,
  registrationConflictBody,
  saveRegistration,
} from '../lib/registration'
import { claimNewRegistrationPostProcessing, markNewRegistrationPhase } from '../lib/registrationPostProcessing'
import { applyNewRegistrationStatsOnce, updateEventStatsForRegistration } from '../lib/stats'
import { publishRegistrationPatches, publishRegistrationPatchesStrict } from '../lib/ws/actions'

const { emailFrom } = CONFIG

const getData = async (registration: Patch<JsonRegistration>) => {
  const eventId = typeof registration.eventId === 'string' ? registration.eventId : ''
  const id = typeof registration.id === 'string' ? registration.id : undefined
  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)
  const existing = id ? await getRegistration(eventId, id) : undefined

  return { confirmedEvent, existing }
}

const getEmailContext = (update: boolean, cancel: boolean, confirm: boolean, invitation: boolean) => {
  if (cancel) return 'cancel'
  if (confirm) return 'confirm'
  if (invitation) return 'invitation'
  if (update) return 'update'
  return ''
}

const getAuditMessage = (
  cancel: boolean,
  confirm: boolean,
  data: JsonRegistration,
  existing?: JsonRegistration
): string => {
  if (cancel) return getCancelAuditMessage(data)
  if (confirm) return 'Ilmoittautumisen vahvistus'
  if (!existing) return 'Ilmoittautui'

  return getRegistrationChanges(existing, data)
}

const toTestResult = (result: JsonTestResult): TestResult => ({ ...result, date: new Date(result.date) })

const toManualTestResult = (
  result: JsonTestResult & { id: string },
  registration: JsonRegistration
): ManualTestResult => ({
  ...result,
  date: new Date(result.date),
  official: false,
  regNo: registration.dog.regNo,
})

const resolveQualification = (registration: JsonRegistration, event: JsonConfirmedEvent) => {
  const qualification = filterRelevantResults(
    {
      entryEndDate: event.entryEndDate ? new Date(event.entryEndDate) : undefined,
      entryOrigEndDate: event.entryOrigEndDate ? new Date(event.entryOrigEndDate) : undefined,
      eventType: event.eventType,
      qualificationStartDate: event.qualificationStartDate ? new Date(event.qualificationStartDate) : undefined,
      startDate: new Date(event.startDate),
    },
    registration.class,
    registration.dog.results?.map(toTestResult),
    registration.results?.map((result) => toManualTestResult(result, registration))
  )
  registration.qualifies = qualification.qualifies
  registration.qualifyingResults = qualification.relevant.map(({ date, ...result }) => ({
    ...result,
    date: date.toISOString(),
  }))
}

const isCompleteRegistration = (registration: Patch<JsonRegistration>): registration is JsonRegistration =>
  typeof registration.agreeToTerms === 'boolean' &&
  isObject(registration.breeder) &&
  typeof registration.createdAt === 'string' &&
  typeof registration.createdBy === 'string' &&
  Array.isArray(registration.dates) &&
  isObject(registration.dog) &&
  typeof registration.eventId === 'string' &&
  typeof registration.eventType === 'string' &&
  typeof registration.id === 'string' &&
  (registration.language === 'fi' || registration.language === 'en') &&
  typeof registration.modifiedAt === 'string' &&
  typeof registration.modifiedBy === 'string' &&
  typeof registration.notes === 'string' &&
  Array.isArray(registration.qualifyingResults) &&
  typeof registration.reserve === 'string'

const prepareNewRegistration = async (
  registration: Patch<JsonRegistration>,
  confirmedEvent: JsonConfirmedEvent,
  timestamp: string,
  username: string,
  event: Parameters<typeof response>[2]
) => {
  if (!isEntryOpen(confirmedEvent)) {
    return response(410, { message: 'Gone: Entry is not open' }, event)
  }

  const alreadyRegistered = await findExistingRegistrationToEventForDog(
    registration.eventId ?? '',
    registration.dog?.regNo ?? '',
    registration.creationIdempotencyKey ?? undefined
  )

  if (alreadyRegistered) return alreadyRegistered

  registration.id = nanoid(10)
  registration.createdAt = timestamp
  registration.createdBy = username
  registration.state = confirmedEvent.paymentTime === 'confirmation' ? 'ready' : 'creating'
}

const completeNewRegistration = async (
  registration: JsonRegistration,
  confirmedEvent: JsonConfirmedEvent,
  origin: string,
  username: string,
  editToken: string,
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

    if (!saved.newRegistrationStatsAt) {
      await applyNewRegistrationStatsOnce(saved, confirmedEvent, claim.token)
    }

    if (!saved.newRegistrationAuditAt) {
      await auditStrict(
        { auditKey: registrationAuditKey(saved), message: 'Ilmoittautui', user: username },
        saved.createdAt
      )
      await markNewRegistrationPhase(saved.eventId, saved.id, claim.token, 'newRegistrationAuditAt')
    }

    const context = getEmailContext(false, false, false, false)
    if (
      (context || confirmedEvent.paymentTime === 'confirmation') &&
      saved.handler?.email &&
      saved.owner?.email &&
      !saved.newRegistrationEmailSentAt
    ) {
      await sendMessages(origin, context, saved, confirmedEvent, undefined, editToken)
      await markNewRegistrationPhase(saved.eventId, saved.id, claim.token, 'newRegistrationEmailSentAt')
    }

    if (!saved.newRegistrationPublishedAt && saved.state === 'ready') {
      const updatedEvent = await updateRegistrations(saved.eventId)
      await publishRegistrationPatchesStrict(
        saved.eventId,
        [createRegistrationPatch(saved), ...groupPatches.filter((patch) => patch.id !== saved.id)],
        updatedEvent.organizer.id
      )
      await markNewRegistrationPhase(saved.eventId, saved.id, claim.token, 'newRegistrationPublishedAt')
    }

    await markNewRegistrationPhase(saved.eventId, saved.id, claim.token, 'newRegistrationProcessedAt')
    return saved
  } finally {
    await claim.release()
  }
}

const sendMessages = async (
  origin: string,
  context: RegistrationTemplateContext,
  registration: JsonRegistration,
  confirmedEvent: JsonConfirmedEvent,
  existing: JsonRegistration | undefined,
  editToken: string
) => {
  // send update message when registration is updated, confirmed or cancelled
  const to = emailTo(registration)
  const templateData = registrationEmailTemplateData(registration, confirmedEvent, origin, context, editToken)

  await clearRegistrationEmailDeliveryStatus(registration.eventId, registration.id)
  delete registration.emailDeliveryStatus
  await sendTemplatedMail(
    'registration',
    registration.language,
    emailFrom,
    to,
    templateData,
    registrationEmailTags(registration, 'registration')
  )

  await audit({
    auditKey: registrationAuditKey(registration),
    message: `Email: ${templateData.subject}, to: ${to.join(', ')}`,
    user: 'anonymous',
  })

  // also notify secretary about cancellation (allowed to fail)
  try {
    const secretaryEmail = confirmedEvent.contactInfo?.secretary?.email ?? confirmedEvent.secretary.email
    if (context === 'cancel' && secretaryEmail) {
      let template: EmailTemplateId | undefined

      const groupKey = existing?.group?.key ?? GROUP_KEY_RESERVE
      if (groupKey === GROUP_KEY_RESERVE) {
        template = existing?.reserveNotified ? 'cancel-reserve' : 'cancel-early'
      } else if (isParticipantGroup(groupKey)) {
        template = 'cancel-picked'
      }

      if (template) {
        const cancelTemplateData = registrationEmailTemplateData(
          registration,
          confirmedEvent,
          origin,
          context,
          editToken,
          '',
          existing?.group
        )
        await sendTemplatedMail(template, 'fi', emailFrom, [secretaryEmail], cancelTemplateData)
      }
    }
  } catch (e) {
    console.error('error notifying cancellation to secretary', e)
  }
}

const putRegistrationLambda = lambda('putRegistration', async (event) => {
  const username = await getUsername(event)
  const timestamp = new Date().toISOString()
  const origin = getOrigin(event)
  const patchRequest = isPatchRequest(event)

  const parsed: Patch<JsonRegistration> | JsonRegistrationPatchRequest = parseJSONWithFallback(event.body)
  const operationRequest = patchRequest && isPatchOperationRequest(parsed) ? parsed : undefined
  if (patchRequest && isObject(parsed) && Object.hasOwn(parsed, 'operations') && !operationRequest) {
    return response(400, { message: 'Bad request: invalid patch operations' }, event)
  }
  if (!operationRequest && hasInvalidRegistrationArrayFields(parsed)) {
    return response(400, { message: 'Bad request: registration array fields must be arrays' }, event)
  }
  if (operationRequest && (typeof operationRequest.eventId !== 'string' || typeof operationRequest.id !== 'string')) {
    return response(400, { message: 'Bad request: invalid patch metadata' }, event)
  }
  let registration = operationRequest
    ? ({ eventId: operationRequest.eventId, id: operationRequest.id } satisfies Patch<JsonRegistration>)
    : publicRegistrationPatch(parsed, Boolean(parsed.id))
  if (!operationRequest) normalizeRegistrationEmails(registration)

  if (patchRequest && (!registration.eventId || !registration.id)) {
    return response(400, { message: 'Bad request: PATCH requires eventId and id' }, event)
  }

  const { confirmedEvent, existing } = await getData(registration)

  if (!confirmedEvent) {
    return response(404, { message: 'Not found' }, event)
  }
  if (isEventOver({ endDate: new Date(confirmedEvent.endDate) })) {
    return response(404, { message: 'Not found' }, event)
  }

  if (!existing) {
    const duplicate = await prepareNewRegistration(registration, confirmedEvent, timestamp, username, event)
    if (duplicate) {
      if (!('eventId' in duplicate)) return duplicate
      const groupPatches = await repairReadyRegistrationGroups(duplicate.eventId, { name: username })
      if (
        typeof registration.creationIdempotencyKey === 'string' &&
        registration.creationIdempotencyKey === duplicate.creationIdempotencyKey
      ) {
        const editToken = await getRegistrationEditToken(duplicate)
        // Reconciliation may have persisted consequential renumberings before
        // the original publication failed. Send the current ready snapshot so
        // this retry repairs every connected client's ordering, not just this
        // registration's own patch.
        const completed = await completeNewRegistration(
          duplicate,
          confirmedEvent,
          origin,
          username,
          editToken,
          groupPatches
        )
        return response(200, participantRegistrationResponse(completed, editToken), event)
      }
      if (groupPatches.length) {
        const updatedEvent = await updateRegistrations(duplicate.eventId)
        await publishRegistrationPatches(duplicate.eventId, groupPatches, updatedEvent.organizer.id)
      }
      return response(409, registrationConflictBody(duplicate), event)
    }
    registration.editTokenVersion = DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION
  }

  if (typeof registration.eventId !== 'string' || typeof registration.id !== 'string') {
    return response(400, { message: 'Bad request: registration identity is missing' }, event)
  }
  const editToken = existing
    ? await authorizeRegistrationEdit(event, existing)
    : await getRegistrationEditToken({
        editTokenVersion: registration.editTokenVersion ?? undefined,
        eventId: registration.eventId,
        id: registration.id,
      })

  if (existing && operationRequest) {
    if (operationRequest.operations.some(({ path }) => !isPublicRegistrationOperationField(path[0]))) {
      return response(400, { message: 'Bad request: patch changes a protected registration field' }, event)
    }
    try {
      const patchedRegistration = applyPatchOperations(existing, operationRequest.operations)
      if (hasInvalidRegistrationArrayFields(patchedRegistration, true)) {
        return response(400, { message: 'Bad request: registration array fields must be arrays' }, event)
      }
      registration = publicRegistrationPatch(patchedRegistration, true)
    } catch (error) {
      if (error instanceof InvalidPatchError) {
        return response(400, { message: `Bad request: ${error.message}` }, event)
      }
      throw error
    }
    registration = {
      ...registration,
      ...(registration.handler ? { handler: { ...registration.handler } } : {}),
      ...(registration.owner ? { owner: { ...registration.owner } } : {}),
      ...(registration.payer ? { payer: { ...registration.payer } } : {}),
    }
    normalizeRegistrationEmails(registration)
  }

  const update = !!existing
  const cancel = !existing?.cancelled && !!registration.cancelled
  const confirm = !existing?.confirmed && !!registration.confirmed && !existing?.cancelled
  const invitationAttachment = existing ? getSentInvitationAttachment(confirmedEvent, existing) : undefined
  const previousInvitationAttachmentRead =
    existing?.invitationAttachmentRead ??
    (existing?.invitationRead ? (existing.invitationAttachmentSent ?? invitationAttachment) : undefined)
  const invitation =
    !!registration.invitationRead &&
    !existing?.cancelled &&
    (!existing?.invitationRead ||
      Boolean(invitationAttachment && previousInvitationAttachmentRead !== invitationAttachment))

  // modification info is always updated
  registration.modifiedAt = timestamp
  registration.modifiedBy = username
  registration.updatedAt = timestamp

  let data: JsonRegistration
  if (existing) {
    data = patchMerge(existing, registration)
  } else {
    registration.qualifies = false
    registration.qualifyingResults = []
    if (!isCompleteRegistration(registration)) {
      return response(400, { message: 'Bad request: registration data is incomplete' }, event)
    }
    data = registration
  }

  if (invitation && invitationAttachment) {
    data.invitationAttachmentRead = invitationAttachment
  }

  resolveQualification(data, confirmedEvent)

  if (existing && !hasRegistrationChanges(existing, data)) {
    return response(304, undefined, event)
  }

  await assertRegistrationEmailsNotSuppressed(data)

  if (shouldClearRegistrationEmailDeliveryStatus(existing, data)) {
    delete data.emailDeliveryStatus
  }

  // A ready registration changes the complete ordering, so make its durable
  // write and group assignment one locked operation. Retrying the lock before
  // the write prevents a permanently unassigned ready registration.
  const releasePaymentLock =
    !existing && data.state === 'ready' ? await lockRegistrationPayments(data.eventId) : undefined
  let releaseGroupsLock: (() => Promise<void>) | undefined
  let groupPatches: ReturnType<typeof createRegistrationPatches> = []
  let savedData = data
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

    if (savedData.state === 'ready') {
      const readyRegistrations = await getReadyRegistrationsByEventId(savedData.eventId, true)
      const reconciliationRegistrations = [
        ...readyRegistrations.filter((registration) => registration.id !== savedData.id),
        { ...savedData, ...(savedData.group ? { group: { ...savedData.group } } : {}) },
      ]
      const beforeReconciliation = reconciliationRegistrations.map((registration) => ({
        ...registration,
        ...(registration.group ? { group: { ...registration.group } } : {}),
      }))
      const reconciled = await fixRegistrationGroups(reconciliationRegistrations, { name: username })
      groupPatches = createRegistrationPatches(reconciled, beforeReconciliation)
      savedData = {
        ...savedData,
        group: reconciled.find((registration) => registration.id === savedData.id)?.group ?? savedData.group,
      }
    }
  } finally {
    if (releaseGroupsLock) await releaseGroupsLock()
    if (releasePaymentLock) await releasePaymentLock()
  }
  if (!existing) {
    const responseEditToken = savedData.id === registration.id ? editToken : await getRegistrationEditToken(savedData)
    const completed = await completeNewRegistration(
      savedData,
      confirmedEvent,
      origin,
      username,
      responseEditToken,
      groupPatches
    )
    return response(200, participantRegistrationResponse(completed, responseEditToken), event)
  }
  // Update organizer event stats after registration change
  await updateEventStatsForRegistration(savedData, existing, confirmedEvent)

  if (update || cancel || savedData.state === 'ready') {
    const updatedEvent = await updateRegistrations(savedData.eventId)
    await publishRegistrationPatches(
      savedData.eventId,
      [createRegistrationPatch(savedData, existing), ...groupPatches.filter((patch) => patch.id !== savedData.id)],
      updatedEvent.organizer.id
    )
  }

  const message = getAuditMessage(cancel, confirm, savedData, existing)
  if (message) {
    await audit({
      auditKey: registrationAuditKey(savedData),
      message,
      user: username,
    })
  }

  const context = getEmailContext(update, cancel, confirm, invitation)
  if (
    (context || confirmedEvent.paymentTime === 'confirmation') &&
    savedData.handler?.email &&
    savedData.owner?.email
  ) {
    await sendMessages(origin, context, savedData, confirmedEvent, existing, editToken)
  }

  return response(200, participantRegistrationResponse(savedData, editToken), event)
})

export default putRegistrationLambda
