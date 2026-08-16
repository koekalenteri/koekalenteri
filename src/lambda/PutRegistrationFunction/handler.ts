import type { APIGatewayProxyEvent } from 'aws-lambda'
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
import { isEntryOpen, isEventOver } from '../../lib/event'
import { applyPatchOperations, InvalidPatchError, isPatchOperationRequest } from '../../lib/patch'
import { filterRelevantResults } from '../../lib/qualification'
import {
  GROUP_KEY_RESERVE,
  getSentInvitationAttachment,
  hasInvalidRegistrationArrayFields,
  isParticipantGroup,
  isPublicRegistrationOperationField,
} from '../../lib/registration'
import { isObject, patchMerge } from '../../lib/utils'
import { CONFIG } from '../config'
import { getFrontendOrigin } from '../lib/api-gw'
import { audit, auditStrict, registrationAuditKey } from '../lib/audit'
import { getUsername } from '../lib/auth'
import { emailTo, registrationEmailTags, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import {
  assertRegistrationEmailsNotSuppressed,
  normalizeRegistrationEmails,
  shouldClearRegistrationEmailDeliveryStatus,
} from '../lib/emailSuppression'
import { getEvent, repairReadyRegistrationGroups, updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { isPatchRequest, lambda, response } from '../lib/lambda'
import {
  authorizeRegistrationEdit,
  claimNewRegistrationPostProcessing,
  clearRegistrationEmailDeliveryStatus,
  createRegistrationPatch,
  DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION,
  findExistingRegistrationToEventForDog,
  getCancelAuditMessage,
  getRegistration,
  getRegistrationChanges,
  getRegistrationEditToken,
  hasRegistrationChanges,
  markNewRegistrationPhase,
  participantRegistrationResponse,
  publicRegistrationPatch,
  registrationConflictBody,
} from '../lib/registration'
import { persistRegistrationWithGroups } from '../lib/registrationPersistence'
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

const handleDuplicateRegistration = async (
  duplicate: JsonRegistration,
  registration: Patch<JsonRegistration>,
  confirmedEvent: JsonConfirmedEvent,
  linkOrigin: string,
  username: string
) => {
  const groupPatches = await repairReadyRegistrationGroups(duplicate.eventId, { name: username })
  const isIdempotentRetry =
    typeof registration.creationIdempotencyKey === 'string' &&
    registration.creationIdempotencyKey === duplicate.creationIdempotencyKey
  if (!isIdempotentRetry) {
    if (groupPatches.length) {
      const updatedEvent = await updateRegistrations(duplicate.eventId)
      await publishRegistrationPatches(duplicate.eventId, groupPatches, updatedEvent.organizer.id)
    }
    return { conflict: duplicate }
  }

  const editToken = await getRegistrationEditToken(duplicate)
  const completed = await completeNewRegistration(
    duplicate,
    confirmedEvent,
    linkOrigin,
    username,
    editToken,
    groupPatches
  )
  return { completed, editToken }
}

const preparePublicRegistrationCreation = async (
  registration: Patch<JsonRegistration>,
  existing: JsonRegistration | undefined,
  confirmedEvent: JsonConfirmedEvent,
  timestamp: string,
  username: string,
  event: APIGatewayProxyEvent,
  linkOrigin: string
) => {
  if (existing) return { registration }

  const duplicate = await prepareNewRegistration(registration, confirmedEvent, timestamp, username, event)
  if (!duplicate) {
    registration.editTokenVersion = DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION
    return { registration }
  }
  if (!('eventId' in duplicate)) return { earlyResponse: duplicate }

  const handled = await handleDuplicateRegistration(duplicate, registration, confirmedEvent, linkOrigin, username)
  if (handled.conflict) {
    return { earlyResponse: response(409, registrationConflictBody(handled.conflict), event) }
  }
  return {
    earlyResponse: response(200, participantRegistrationResponse(handled.completed, handled.editToken), event),
  }
}

const authorizeAndApplyPublicPatch = async (
  event: APIGatewayProxyEvent,
  existing: JsonRegistration | undefined,
  registration: Patch<JsonRegistration>,
  operationRequest: JsonRegistrationPatchRequest | undefined
) => {
  if (typeof registration.eventId !== 'string' || typeof registration.id !== 'string') {
    return { invalid: 'registration identity is missing' as const }
  }
  const editToken = existing
    ? await authorizeRegistrationEdit(event, existing)
    : await getRegistrationEditToken({
        editTokenVersion: registration.editTokenVersion ?? undefined,
        eventId: registration.eventId,
        id: registration.id,
      })
  if (!existing || !operationRequest) return { editToken, registration }

  try {
    return { editToken, registration: applyPublicPatchRequest(existing, operationRequest) }
  } catch (error) {
    if (error instanceof InvalidPatchError) return { invalid: error.message }
    throw error
  }
}

const buildPublicRegistrationData = (
  registration: Patch<JsonRegistration>,
  existing: JsonRegistration | undefined,
  confirmedEvent: JsonConfirmedEvent
) => {
  const update = Boolean(existing)
  const cancel = !existing?.cancelled && Boolean(registration.cancelled)
  const confirm = !existing?.confirmed && Boolean(registration.confirmed) && !existing?.cancelled
  const invitationAttachment = existing ? getSentInvitationAttachment(confirmedEvent, existing) : undefined
  const previousAttachment =
    existing?.invitationAttachmentRead ??
    (existing?.invitationRead ? (existing.invitationAttachmentSent ?? invitationAttachment) : undefined)
  const invitation =
    Boolean(registration.invitationRead) &&
    !existing?.cancelled &&
    (!existing?.invitationRead || Boolean(invitationAttachment && previousAttachment !== invitationAttachment))

  let data: JsonRegistration
  if (existing) data = patchMerge(existing, registration)
  else {
    registration.qualifies = false
    registration.qualifyingResults = []
    if (!isCompleteRegistration(registration)) return { invalid: 'registration data is incomplete' as const }
    data = registration
  }
  if (invitation && invitationAttachment) data.invitationAttachmentRead = invitationAttachment
  return { cancel, confirm, data, invitation, update }
}

const applyPublicPatchRequest = (
  existing: JsonRegistration,
  operationRequest: JsonRegistrationPatchRequest
): Patch<JsonRegistration> => {
  if (operationRequest.operations.some(({ path }) => !isPublicRegistrationOperationField(path[0]))) {
    throw new InvalidPatchError('patch changes a protected registration field')
  }
  const patchedRegistration = applyPatchOperations(existing, operationRequest.operations)
  if (hasInvalidRegistrationArrayFields(patchedRegistration, true)) {
    throw new InvalidPatchError('registration array fields must be arrays')
  }
  const registration = publicRegistrationPatch(patchedRegistration, true)
  const cloned = {
    ...registration,
    ...(registration.handler ? { handler: { ...registration.handler } } : {}),
    ...(registration.owner ? { owner: { ...registration.owner } } : {}),
    ...(registration.payer ? { payer: { ...registration.payer } } : {}),
  }
  normalizeRegistrationEmails(cloned)
  return cloned
}

const parsePublicRegistrationRequest = (body: string | null, patchRequest: boolean) => {
  const parsed: Patch<JsonRegistration> | JsonRegistrationPatchRequest = parseJSONWithFallback(body)
  const operationRequest = patchRequest && isPatchOperationRequest(parsed) ? parsed : undefined
  if (patchRequest && isObject(parsed) && Object.hasOwn(parsed, 'operations') && !operationRequest) {
    return { invalid: 'invalid patch operations' as const }
  }
  if (!operationRequest && hasInvalidRegistrationArrayFields(parsed)) {
    return { invalid: 'registration array fields must be arrays' as const }
  }
  if (operationRequest && (typeof operationRequest.eventId !== 'string' || typeof operationRequest.id !== 'string')) {
    return { invalid: 'invalid patch metadata' as const }
  }
  const registration = operationRequest
    ? ({ eventId: operationRequest.eventId, id: operationRequest.id } satisfies Patch<JsonRegistration>)
    : publicRegistrationPatch(parsed, Boolean(parsed.id))
  return { operationRequest, registration }
}

interface FinalizeRegistrationOptions {
  cancel: boolean
  confirm: boolean
  confirmedEvent: JsonConfirmedEvent
  editToken: string
  existing: JsonRegistration
  groupPatches: Patch<JsonRegistration>[]
  invitation: boolean
  linkOrigin: string
  savedData: JsonRegistration
  update: boolean
  username: string
}

const finalizeRegistrationUpdate = async ({
  cancel,
  confirm,
  confirmedEvent,
  editToken,
  existing,
  groupPatches,
  invitation,
  linkOrigin,
  savedData,
  update,
  username,
}: FinalizeRegistrationOptions) => {
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
  if (message) await audit({ auditKey: registrationAuditKey(savedData), message, user: username })

  const context = getEmailContext(update, cancel, confirm, invitation)
  const shouldSend =
    (context || confirmedEvent.paymentTime === 'confirmation') && savedData.handler?.email && savedData.owner?.email
  if (shouldSend) await sendMessages(linkOrigin, context, savedData, confirmedEvent, existing, editToken)
}

const putRegistrationLambda = lambda('putRegistration', async (event) => {
  const username = await getUsername(event)
  const timestamp = new Date().toISOString()
  const linkOrigin = getFrontendOrigin(event)
  const patchRequest = isPatchRequest(event)

  const request = parsePublicRegistrationRequest(event.body, patchRequest)
  if ('invalid' in request) return response(400, { message: `Bad request: ${request.invalid}` }, event)
  let { registration } = request
  const { operationRequest } = request
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

  const creation = await preparePublicRegistrationCreation(
    registration,
    existing,
    confirmedEvent,
    timestamp,
    username,
    event,
    linkOrigin
  )
  if (creation.earlyResponse) return creation.earlyResponse
  registration = creation.registration

  const authorized = await authorizeAndApplyPublicPatch(event, existing, registration, operationRequest)
  if ('invalid' in authorized) return response(400, { message: `Bad request: ${authorized.invalid}` }, event)
  registration = authorized.registration
  const { editToken } = authorized

  // modification info is always updated
  registration.modifiedAt = timestamp
  registration.modifiedBy = username
  registration.updatedAt = timestamp

  const built = buildPublicRegistrationData(registration, existing, confirmedEvent)
  if ('invalid' in built) return response(400, { message: `Bad request: ${built.invalid}` }, event)
  const { cancel, confirm, data, invitation, update } = built

  resolveQualification(data, confirmedEvent)

  if (existing && !hasRegistrationChanges(existing, data)) {
    return response(304, undefined, event)
  }

  await assertRegistrationEmailsNotSuppressed(data)

  if (shouldClearRegistrationEmailDeliveryStatus(existing, data)) {
    delete data.emailDeliveryStatus
  }

  const persisted = await persistRegistrationWithGroups(data, existing, { name: username }, async () => undefined)
  if (persisted.kind === 'conflict') {
    return response(409, registrationConflictBody(persisted.conflict), event)
  }
  const { groupPatches, savedData } = persisted
  if (!existing) {
    const responseEditToken = savedData.id === registration.id ? editToken : await getRegistrationEditToken(savedData)
    const completed = await completeNewRegistration(
      savedData,
      confirmedEvent,
      linkOrigin,
      username,
      responseEditToken,
      groupPatches
    )
    return response(200, participantRegistrationResponse(completed, responseEditToken), event)
  }
  await finalizeRegistrationUpdate({
    cancel,
    confirm,
    confirmedEvent,
    editToken,
    existing,
    groupPatches,
    invitation,
    linkOrigin,
    savedData,
    update,
    username,
  })

  return response(200, participantRegistrationResponse(savedData, editToken), event)
})

export default putRegistrationLambda
