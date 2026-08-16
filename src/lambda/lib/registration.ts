import type { APIGatewayProxyEvent } from 'aws-lambda'
import type {
  EmailTemplateId,
  JsonConfirmedEvent,
  JsonRegistration,
  Patch,
  RegistrationTemplateContext,
} from '../../types'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { formatDate } from '../../i18n/dates'
import { i18n } from '../../i18n/lambda'
import { getChangedTopLevelKeys, getNestedChanges, objectsDiffer } from '../../lib/diff'
import {
  GROUP_KEY_RESERVE,
  getRegistrationClass,
  isParticipantGroup,
  isPredefinedReason,
  isRegistrationClass,
  PUBLIC_REGISTRATION_FIELDS,
  PUBLIC_REGISTRATION_UPDATE_FIELDS,
} from '../../lib/registration'
import { isObject } from '../../lib/utils'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { audit, eventAuditKey, registrationAuditKey } from './audit'
import { emailTo, registrationEmailTags, registrationEmailTemplateData, sendTemplatedMail } from './email'
import { LambdaError } from './lambda'
import { createDynamoLease } from './lease'
import { createPatch } from './patch'
import { getRegistrationEditTokenSecret } from './secrets'

const { emailFrom, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)
const NEW_REGISTRATION_LEASE_DURATION_MS = 90 * 1000

type SentRegistrationMessagesAudit = {
  event: Pick<JsonConfirmedEvent, 'id'>
  failed: string[]
  label: string
  labelKey: string
  ok: string[]
  registrations: Pick<JsonRegistration, 'class'>[]
  user: string
}

export const createSentRegistrationMessagesAudit = ({
  event,
  failed,
  label,
  labelKey,
  ok,
  registrations,
  user,
}: SentRegistrationMessagesAudit) => {
  const messageClasses = [
    ...new Set(registrations.map((registration) => registration.class).filter(isRegistrationClass)),
  ]
  const messageClass = messageClasses.length === 1 ? messageClasses[0] : undefined
  const classDescription = messageClass ? ` luokkaan ${messageClass}` : ''

  return {
    auditKey: eventAuditKey(event),
    ...(failed.length
      ? {
          details: [
            {
              detailKey: 'audit.details.failedRecipients',
              detailParams: { recipients: failed.join('\n') },
            },
          ],
        }
      : {}),
    message: `${label}${classDescription} lähetetty: onnistui ${ok.length}, epäonnistui ${failed.length}`,
    messageKey: messageClass ? 'audit.messages.classEmailSent' : 'audit.messages.emailSent',
    messageParams: {
      ...(messageClass ? { eventClass: messageClass } : {}),
      failed: failed.length,
      ok: ok.length,
      template: label,
      templateKey: labelKey,
    },
    user,
  }
}

const newRegistrationWorkflowFields = [
  'newRegistrationAuditAt',
  'newRegistrationEmailSentAt',
  'newRegistrationLease',
  'newRegistrationProcessedAt',
  'newRegistrationPublishedAt',
  'newRegistrationStatsAt',
] as const satisfies ReadonlyArray<keyof JsonRegistration>

/** Removes durable and leased state that belongs only to one creation attempt. */
export const removeNewRegistrationWorkflowMetadata = <T extends object>(registration: T): T => {
  const mutable = registration as T & Record<string, unknown>
  for (const field of newRegistrationWorkflowFields) delete mutable[field]
  return registration
}

/** Removes all registration-creation internals, including the retry credential. */
export const removeRegistrationCreationMetadata = <T extends object>(registration: T): T => {
  removeNewRegistrationWorkflowMetadata(registration)
  delete (registration as T & Record<string, unknown>).creationIdempotencyKey
  return registration
}

type NewRegistrationPhase =
  | 'newRegistrationPublishedAt'
  | 'newRegistrationAuditAt'
  | 'newRegistrationEmailSentAt'
  | 'newRegistrationProcessedAt'

const newRegistrationPostProcessingLease = createDynamoLease<JsonRegistration, NewRegistrationPhase>({
  client: dynamoDB,
  durationMs: NEW_REGISTRATION_LEASE_DURATION_MS,
  itemExistsField: 'id',
  leaseField: 'newRegistrationLease',
  table: registrationTable,
})

export const DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION = 1

type RegistrationEditTokenFields = Pick<JsonRegistration, 'editTokenVersion' | 'eventId' | 'id'>

export const claimNewRegistrationPostProcessing = async (eventId: string, id: string) => {
  const claim = await newRegistrationPostProcessingLease.claim({
    key: { eventId, id },
    missingItemMessage: `Registration '${id}' disappeared while claiming post-processing`,
  })
  if (!claim) return undefined

  return { registration: claim.item, release: claim.release, token: claim.token }
}

export const markNewRegistrationPhase = (eventId: string, id: string, token: string, phase: NewRegistrationPhase) =>
  newRegistrationPostProcessingLease.markPhase({ eventId, id }, token, phase)

export const deriveRegistrationEditToken = (registration: RegistrationEditTokenFields, secret: string): string =>
  createHmac('sha256', secret)
    .update(
      `registration-edit:${registration.eventId}:${registration.id}:${registration.editTokenVersion ?? DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION}`
    )
    .digest('base64url')

export const getRegistrationEditToken = async (registration: RegistrationEditTokenFields): Promise<string> =>
  deriveRegistrationEditToken(registration, await getRegistrationEditTokenSecret())

const getBearerToken = (event: Pick<APIGatewayProxyEvent, 'headers'>): string => {
  const authorization = event.headers.Authorization ?? event.headers.authorization ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(authorization)
  return match?.[1] ?? ''
}

const tokensMatch = (actual: string, expected: string): boolean => {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export const authorizeRegistrationEdit = async (
  event: Pick<APIGatewayProxyEvent, 'headers'>,
  registration: Pick<JsonRegistration, 'editTokenVersion' | 'eventId' | 'id'>
): Promise<string> => {
  const token = getBearerToken(event)
  if (!token) throw new LambdaError(404, 'not found')

  const expected = await getRegistrationEditToken(registration)
  if (!tokensMatch(token, expected)) throw new LambdaError(404, 'not found')
  return token
}

export const authorizeRegistrationRead = async (
  event: Pick<APIGatewayProxyEvent, 'headers'>,
  registration: Pick<JsonRegistration, 'editTokenVersion' | 'eventId' | 'id'>
): Promise<string> => {
  const token = getBearerToken(event)

  // Registrations created before edit tokens were introduced have links containing
  // only the registration ID. Keep those links readable, but never extend this
  // compatibility path to token-versioned registrations.
  if (!token && registration.editTokenVersion === undefined) return getRegistrationEditToken(registration)

  return authorizeRegistrationEdit(event, registration)
}

export const publicRegistrationPatch = (input: Patch<JsonRegistration>, update: boolean): Patch<JsonRegistration> => {
  const result: Patch<JsonRegistration> = {}
  const fields = update ? PUBLIC_REGISTRATION_UPDATE_FIELDS : PUBLIC_REGISTRATION_FIELDS
  for (const field of fields) {
    if (Object.hasOwn(input, field)) Object.assign(result, { [field]: input[field] })
  }

  if (!update) {
    delete result.cancelReason
    delete result.cancelled
    delete result.confirmed
    delete result.invitationRead
  } else {
    // Participant workflow flags are one-way transitions. Clearing them is organizer-only.
    if (result.cancelled !== true) {
      delete result.cancelled
      delete result.cancelReason
    }
    if (result.confirmed !== true) delete result.confirmed
    if (result.invitationRead !== true) delete result.invitationRead
  }
  return result
}

export const participantRegistrationResponse = <T extends Partial<JsonRegistration>>(
  registration: T,
  editToken: string
) => {
  const result = removeRegistrationCreationMetadata({ ...registration, editToken })
  delete result.editTokenVersion
  return result
}

export const getRegistration = async (eventId: string, registrationId: string): Promise<JsonRegistration> => {
  const registration = await dynamoDB.read<JsonRegistration>(
    {
      eventId: eventId,
      id: registrationId,
    },
    registrationTable
  )
  if (!registration) {
    throw new LambdaError(404, `Registration with id '${registrationId}' for event with id '${eventId}' was not found`)
  }
  return registration
}

export const saveRegistration = async (data: JsonRegistration) => dynamoDB.write(data, registrationTable)

export const patchRegistration = async (
  eventId: JsonRegistration['eventId'],
  id: JsonRegistration['id'],
  existing: JsonRegistration,
  next: JsonRegistration
): Promise<JsonRegistration> => {
  const { remove, set } = createPatch(next, existing)

  if (!set && !remove) {
    return existing
  }

  await dynamoDB.update(
    { eventId, id },
    {
      ...(set ? { set } : {}),
      ...(remove ? { remove } : {}),
    },
    registrationTable
  )

  return getRegistration(eventId, id)
}

export const updateRegistrationField = async <F extends keyof JsonRegistration>(
  eventId: JsonRegistration['eventId'],
  id: JsonRegistration['id'],
  field: F,
  value: JsonRegistration[F]
) =>
  dynamoDB.update(
    { eventId, id },
    {
      set: {
        [field]: value,
        updatedAt: new Date().toISOString(),
      },
    }
  )

const setInvitationAttachmentSent = async (registration: JsonRegistration, attachment: string) => {
  const hasUnversionedLegacyRead = registration.invitationRead && !registration.invitationAttachmentRead
  const legacyReadAttachment = hasUnversionedLegacyRead ? registration.invitationAttachmentSent : undefined
  const invitationAttachmentRead = registration.invitationAttachmentRead ?? legacyReadAttachment
  const set: Partial<JsonRegistration> = {
    invitationAttachmentSent: attachment,
    updatedAt: new Date().toISOString(),
  }

  if (invitationAttachmentRead) set.invitationAttachmentRead = invitationAttachmentRead
  // If an old receipt predates invitationAttachmentSent, its exact attachment
  // cannot be recovered. Do not let the legacy boolean mark the new attachment read.
  if (hasUnversionedLegacyRead && !legacyReadAttachment) set.invitationRead = false

  await dynamoDB.update({ eventId: registration.eventId, id: registration.id }, { set })
  registration.invitationAttachmentSent = attachment
  if (invitationAttachmentRead) registration.invitationAttachmentRead = invitationAttachmentRead
  if (set.invitationRead === false) registration.invitationRead = false
}

export const clearRegistrationEmailDeliveryStatus = async (
  eventId: JsonRegistration['eventId'],
  id: JsonRegistration['id']
) => dynamoDB.update({ eventId, id }, { remove: ['emailDeliveryStatus'], set: { updatedAt: new Date().toISOString() } })

const setLastEmail = async (reg: JsonRegistration, value: string) => {
  // update the in-memory object too
  reg.lastEmail = value
  return updateRegistrationField(reg.eventId, reg.id, 'lastEmail', value)
}

export const setReserveNotified = async (registrations: JsonRegistration[]) =>
  Promise.all(
    registrations
      .filter((r) => !r.reserveNotified)
      .map(({ eventId, id, group }) => updateRegistrationField(eventId, id, 'reserveNotified', group?.number ?? 999))
  )

const serializePatchRemovals = (value: unknown): unknown => {
  if (value === undefined) return null
  if (value instanceof Date) return value
  if (Array.isArray(value)) return value.map(serializePatchRemovals)
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, serializePatchRemovals(nestedValue)])
    )
  }
  return value
}

export const createRegistrationPatch = (registration: JsonRegistration, existing?: JsonRegistration) => {
  const withoutCreationMetadata = <T extends object>(item: T) => removeRegistrationCreationMetadata({ ...item })

  if (!existing) return withoutCreationMetadata(registration)

  const { changes } = createPatch(registration, existing)
  return {
    eventId: registration.eventId,
    id: registration.id,
    ...withoutCreationMetadata(serializePatchRemovals(changes) as Record<string, unknown>),
  }
}

export const createRegistrationPatches = (
  registrations: JsonRegistration[],
  existingRegistrations: JsonRegistration[]
) =>
  registrations.flatMap((registration) => {
    const patch = createRegistrationPatch(
      registration,
      existingRegistrations.find((existing) => existing.id === registration.id)
    )

    return Object.keys(patch).length > 2 || !existingRegistrations.some((existing) => existing.id === registration.id)
      ? [patch]
      : []
  })

export const updateReserveNotified = async (registrations: JsonRegistration[]) =>
  Promise.all(
    registrations
      .filter((r) => r.group?.number && r.reserveNotified !== r.group.number)
      .map(({ eventId, id, group }) => updateRegistrationField(eventId, id, 'reserveNotified', group?.number ?? 999))
  )

// exported for testing
export const getLastEmailInfo = (
  template: EmailTemplateId,
  templateName: string,
  registration: JsonRegistration,
  date: string
): string => {
  if (template === 'reserve') {
    return `${templateName} (#${registration.group?.number ?? '?'}) ${date}`
  }

  return `${templateName} ${date}`
}

export const sendTemplatedEmailToEventRegistrations = async (
  template: EmailTemplateId,
  confirmedEvent: JsonConfirmedEvent,
  registrations: JsonRegistration[],
  origin: string | undefined,
  text: string,
  user: string,
  context: RegistrationTemplateContext
) => {
  const t = i18n.getFixedT('fi')
  const lastEmailDate = formatDate(new Date(), 'd.M.yyyy HH:mm')
  const templateName = t(`emailTemplate.${template}`)
  const ok: string[] = []
  const failed: string[] = []
  for (const registration of registrations) {
    const editToken = await getRegistrationEditToken(registration)
    const to = emailTo(registration)
    const data = registrationEmailTemplateData(registration, confirmedEvent, origin, context, editToken, text)
    const auditSubject = context ? data.subject : templateName
    try {
      await clearRegistrationEmailDeliveryStatus(registration.eventId, registration.id)
      await sendTemplatedMail(
        template,
        registration.language,
        emailFrom,
        to,
        data,
        registrationEmailTags(registration, template)
      )
      ok.push(...to)
      await audit({
        auditKey: registrationAuditKey(registration),
        message: `Email: ${auditSubject}, to: ${to.join(', ')}`,
        user,
      })
      await setLastEmail(registration, getLastEmailInfo(template, templateName, registration, lastEmailDate))

      // Update the messagesSent property to track that this template has been sent
      const messagesSent = registration.messagesSent || {}
      messagesSent[template] = true
      await updateRegistrationField(registration.eventId, registration.id, 'messagesSent', messagesSent)

      if (template === 'invitation' && data.event.invitationAttachment) {
        await setInvitationAttachmentSent(registration, data.event.invitationAttachment as string)
      }

      // Update the in-memory object too
      registration.messagesSent = messagesSent
      delete registration.emailDeliveryStatus
    } catch (e) {
      failed.push(...to)
      await audit({
        auditKey: registrationAuditKey(registration),
        message: `FAILED ${auditSubject}: ${to.join(', ')}`,
        user,
      })
      console.error(e)
    }
  }
  return { failed, ok }
}

/**
 * Group registrations by class or eventType
 */
export const groupRegistrationsByClass = (registrations: JsonRegistration[]): Record<string, JsonRegistration[]> => {
  const result: Record<string, JsonRegistration[]> = {}

  for (const reg of registrations) {
    const classKey = getRegistrationClass(reg)
    result[classKey] = result[classKey] || []
    result[classKey].push(reg)
  }

  return result
}

/**
 * Group registrations by class and then by group
 */
export const groupRegistrationsByClassAndGroup = (
  registrationsByClass: Record<string, JsonRegistration[]>
): Record<string, Record<string, JsonRegistration[]>> => {
  const result: Record<string, Record<string, JsonRegistration[]>> = {}

  for (const [classKey, classRegs] of Object.entries(registrationsByClass)) {
    result[classKey] = {}

    for (const reg of classRegs) {
      if (!isParticipantGroup(reg.group?.key)) continue

      const groupKey = reg.group?.key ?? GROUP_KEY_RESERVE
      result[classKey][groupKey] = result[classKey][groupKey] || []
      result[classKey][groupKey].push(reg)
    }
  }

  return result
}

/**
 * Find classes where all participants have received the message
 */
export const findClassesToMark = (
  registrationsByClassAndGroup: Record<string, Record<string, Partial<JsonRegistration>[]>>,
  template: EmailTemplateId
): string[] => {
  const classesToMark: string[] = []

  for (const [classKey, groupsMap] of Object.entries(registrationsByClassAndGroup)) {
    if (Object.keys(groupsMap).length === 0) continue

    const allGroupsReceived = Object.values(groupsMap).every(
      (groupRegs) => groupRegs.length > 0 && groupRegs.every((reg) => reg.messagesSent?.[template])
    )

    if (allGroupsReceived) {
      classesToMark.push(classKey)
    }
  }

  return classesToMark
}

export const getRegistrationsByEventId = async (
  eventId: string,
  consistent: boolean = false
): Promise<JsonRegistration[]> => {
  const registrations = await dynamoDB.query<JsonRegistration>({
    ...(consistent ? { consistent: true } : {}),
    key: 'eventId = :eventId',
    values: { ':eventId': eventId },
  })
  return registrations ?? []
}

export const getReadyRegistrationsByEventId = async (
  eventId: string,
  consistent: boolean = false
): Promise<JsonRegistration[]> => {
  const registrations = await getRegistrationsByEventId(eventId, consistent)

  return registrations.filter((r) => r.state === 'ready')
}

const CREATING_REGISTRATION_RESERVATION_MS = 15 * 60 * 1000

export const registrationConflictBody = (registration: Pick<JsonRegistration, 'cancelled' | 'state'>) =>
  registration.state === 'creating'
    ? {
        error: 'paymentInProgress',
        message: 'Conflict: A payment for this dog is in progress. Please try again in a few minutes.',
      }
    : {
        cancelled: Boolean(registration.cancelled),
        message: 'Conflict: Dog already registered to this event',
      }

export const findExistingRegistrationToEventForDog = async (
  eventId: string,
  regNo: string,
  creationIdempotencyKey?: string,
  consistent: boolean = false
): Promise<JsonRegistration | undefined> => {
  const registrationsForDog = (await getRegistrationsByEventId(eventId, consistent)).filter(
    (registration) => registration.dog.regNo === regNo
  )
  const ready = registrationsForDog.find((registration) => registration.state === 'ready')
  if (ready) return ready

  const creating = registrationsForDog.filter((registration) => registration.state === 'creating')
  const originalAttempt = creationIdempotencyKey
    ? creating.find((registration) => registration.creationIdempotencyKey === creationIdempotencyKey)
    : undefined
  if (originalAttempt) return originalAttempt

  // A pending payment briefly reserves the dog/event pair against competing
  // submissions, but an abandoned payment must not block registration for the
  // rest of the entry period. The original key remains resumable at any age.
  const reservationStartedAfter = Date.now() - CREATING_REGISTRATION_RESERVATION_MS
  return creating.find((registration) => {
    const createdAt = Date.parse(registration.createdAt)
    return Number.isFinite(createdAt) && createdAt >= reservationStartedAfter
  })
}

export const getCancelAuditMessage = (data: JsonRegistration) => {
  if (!data.cancelReason) return 'Ilmoittautuminen peruttiin, syy: (ei täytetty)'

  if (isPredefinedReason(data.cancelReason)) {
    const t = i18n.getFixedT('fi')
    const reason = t(`registration.cancelReason.${data.cancelReason}`)

    return `Ilmoittautuminen peruttiin, syy: ${reason}`
  }

  return `Ilmoittautuminen peruttiin, syy: ${data.cancelReason}`
}

export const getRegistrationChanges = (existing: JsonRegistration, data: JsonRegistration) => {
  const t = i18n.getFixedT('fi')
  const changes = getNestedChanges(existing, data)
  console.debug('Audit changes', changes)
  const changedKeys = new Set(getChangedTopLevelKeys(existing, data))
  const keys = ['class', 'dog', 'breeder', 'owner', 'handler', 'qualifyingResults', 'notes'] as const
  const modified: string[] = []

  for (const key of keys) {
    if (changedKeys.has(key)) {
      modified.push(t(`registration.${key}`))
    }
  }

  return modified.length ? `Muutti: ${modified.join(', ')}` : ''
}

const omitTechnicalRegistrationFields = (registration: JsonRegistration): Partial<JsonRegistration> => {
  const { modifiedAt: _modifiedAt, modifiedBy: _modifiedBy, updatedAt: _updatedAt, ...comparable } = registration

  return comparable
}

export const hasRegistrationChanges = (existing: JsonRegistration, data: JsonRegistration) => {
  return objectsDiffer(omitTechnicalRegistrationFields(existing), omitTechnicalRegistrationFields(data))
}
