import type { AuditActor } from '../../lib/audit'
import type {
  EmailTemplateId,
  JsonConfirmedEvent,
  JsonRegistration,
  JsonRegistrationPatchRequest,
  Patch,
  RegistrationTemplateContext,
} from '../../types'
import { nanoid } from 'nanoid'
import { formatDate } from '../../i18n/dates'
import { auditUser } from '../../lib/audit'
import { registrationDatesOutsideClass } from '../../lib/event'
import { applyPatchOperations, InvalidPatchError, isPatchOperationRequest } from '../../lib/patch'
import {
  GROUP_KEY_RESERVE,
  getRegistrationOwners,
  hasInvalidRegistrationArrayFields,
  isParticipantGroup,
} from '../../lib/registration'
import { isObject, unique } from '../../lib/utils'
import { CONFIG } from '../config'
import { audit, auditStrict, registrationAuditKey } from './audit'
import { emailTo, registrationEmailTags, registrationEmailTemplateData, sendTemplatedMail } from './email'
import { cloneRegistrationPeople, normalizeRegistrationEmails } from './emailSuppression'
import { repairReadyRegistrationGroups, updateRegistrations } from './event'
import { logger } from './log'
import {
  claimNewRegistrationPostProcessing,
  clearRegistrationEmailDeliveryStatus,
  createRegistrationPatch,
  DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION,
  getCancelAuditMessage,
  getRegistrationChanges,
  getRegistrationEditToken,
  markNewRegistrationPhase,
} from './registration'
import { applyNewRegistrationStatsOnce, updateEventStatsForRegistration } from './stats'
import { publishEventCounts, publishRegistrationPatches, publishRegistrationPatchesStrict } from './ws/actions'
import { publishPublicStartList } from './ws/publicStartList'

/**
 * What the participant's and the organizer's registration endpoints share: how a body is read, how
 * a patch is applied, and everything that follows a save. The two handlers differ in who may edit
 * which field and in what they say in the audit trail; the workflow itself is one.
 */

const { emailFrom } = CONFIG

type Actor = AuditActor

/** What a participant's edit did, when it did more than change the details. */
interface RegistrationUpdateFlags {
  cancel: boolean
  confirm: boolean
  invitation: boolean
}

const PLAIN_UPDATE: RegistrationUpdateFlags = { cancel: false, confirm: false, invitation: false }

type ParsedRegistrationRequest =
  | { invalid: string }
  | { operationRequest: JsonRegistrationPatchRequest | undefined; registration: Patch<JsonRegistration> }

/**
 * Whether the body is a list of patch operations or a registration, and whether an operation list
 * carries the metadata it needs. A patch request yields a registration of just its identity; the
 * operations apply once the stored registration is at hand.
 */
export const parseRegistrationRequest = (
  parsed: Patch<JsonRegistration> | JsonRegistrationPatchRequest,
  patchRequest: boolean
): ParsedRegistrationRequest => {
  const operationRequest = patchRequest && isPatchOperationRequest(parsed) ? parsed : undefined
  if (patchRequest && isObject(parsed) && Object.hasOwn(parsed, 'operations') && !operationRequest) {
    return { invalid: 'invalid patch operations' }
  }
  if (
    operationRequest &&
    (typeof operationRequest.eventId !== 'string' ||
      typeof operationRequest.id !== 'string' ||
      (operationRequest.modifiedAt !== undefined && typeof operationRequest.modifiedAt !== 'string'))
  ) {
    return { invalid: 'invalid patch metadata' }
  }
  const registration: Patch<JsonRegistration> = operationRequest
    ? { eventId: operationRequest.eventId, id: operationRequest.id }
    : parsed
  return { operationRequest, registration }
}

/**
 * The stored registration with the operations applied, its people copied so a normalized address
 * never reaches the stored copy. Throws `InvalidPatchError` for an operation on a field the caller
 * does not allow, one that moves the registration to another event or id, or one that leaves an
 * array field as something else.
 */
export const applyRegistrationPatchRequest = (
  existing: JsonRegistration,
  operationRequest: JsonRegistrationPatchRequest,
  isEditableField: (field: unknown) => boolean
): JsonRegistration => {
  if (operationRequest.operations.some(({ path }) => !isEditableField(path[0]))) {
    throw new InvalidPatchError('patch changes a protected registration field')
  }
  const patched = applyPatchOperations(existing, operationRequest.operations)
  if (patched.eventId !== operationRequest.eventId || patched.id !== operationRequest.id) {
    throw new InvalidPatchError('patch must not change registration identity')
  }
  if (hasInvalidRegistrationArrayFields(patched, true)) {
    throw new InvalidPatchError('registration array fields must be arrays')
  }
  return normalizeRegistrationEmails(cloneRegistrationPeople(patched))
}

/** Whether the registration names someone to write to: the handler, and at least one owner. */
export const hasEmailRecipients = (registration: JsonRegistration): boolean =>
  Boolean(registration.handler?.email) && getRegistrationOwners(registration).some((owner) => owner?.email)

/**
 * Recounts the event's entries and sends the new counters on. The recount is domain work and the
 * broadcast is this layer's (KOE-1340), so they travel together wherever registrations move.
 */
const recountRegistrations = async (eventId: string): Promise<JsonConfirmedEvent> => {
  const recounted = await updateRegistrations(eventId)
  await publishEventCounts(recounted)

  return recounted
}

/** The saved registration's patch and the group moves it caused, to the organizer and the public start list. */
const publishRegistrationChange = async (
  confirmedEvent: JsonConfirmedEvent,
  registration: JsonRegistration,
  existing: JsonRegistration | undefined,
  groupPatches: Patch<JsonRegistration>[],
  strict: boolean
) => {
  const patches = [
    createRegistrationPatch(registration, existing),
    ...groupPatches.filter((patch) => patch.id !== registration.id),
  ]
  const publish = strict ? publishRegistrationPatchesStrict : publishRegistrationPatches
  await publish(registration.eventId, patches, confirmedEvent.organizer.id)
  await publishPublicStartList(confirmedEvent)
}

/**
 * A registration whose chosen dates don't fall on its class's (or the event's) days is still
 * accepted — the secretary can fix the dates — but the mismatch is recorded in its audit trail.
 */
const auditDateMismatch = async (registration: JsonRegistration, confirmedEvent: JsonConfirmedEvent, user: Actor) => {
  const mismatches = registrationDatesOutsideClass(confirmedEvent, registration.class, registration.dates)
  if (!mismatches.length) return

  const days = unique(mismatches.map((rd) => formatDate(rd.date, 'd.M.yyyy'))).join(', ')
  const target = registration.class ? `luokan ${registration.class}` : 'tapahtuman'
  await audit({
    auditKey: registrationAuditKey(registration),
    message: `Valitut päivät (${days}) eivät ole ${target} päiviä`,
    ...auditUser(user),
  })
}

const emailContext = ({ cancel, confirm, invitation }: RegistrationUpdateFlags): RegistrationTemplateContext => {
  if (cancel) return 'cancel'
  if (confirm) return 'confirm'
  if (invitation) return 'invitation'
  return 'update'
}

const updateAuditMessage = (
  { cancel, confirm }: RegistrationUpdateFlags,
  registration: JsonRegistration,
  existing: JsonRegistration
): string => {
  if (cancel) return getCancelAuditMessage(registration)
  if (confirm) return 'Ilmoittautumisen vahvistus'
  return getRegistrationChanges(existing, registration)
}

/** The secretary hears of a cancellation too, by where the dog stood; a failure here stays out of the participant's way. */
const notifySecretaryOfCancellation = async (
  registration: JsonRegistration,
  confirmedEvent: JsonConfirmedEvent,
  origin: string,
  editToken: string,
  previous: JsonRegistration | undefined
) => {
  try {
    const secretaryEmail = confirmedEvent.contactInfo?.secretary?.email ?? confirmedEvent.secretary.email
    if (!secretaryEmail) return

    let template: EmailTemplateId | undefined
    const groupKey = previous?.group?.key ?? GROUP_KEY_RESERVE
    if (groupKey === GROUP_KEY_RESERVE) {
      template = previous?.reserveNotified ? 'cancel-reserve' : 'cancel-early'
    } else if (isParticipantGroup(groupKey)) {
      template = 'cancel-picked'
    }
    if (!template) return

    const templateData = registrationEmailTemplateData(
      registration,
      confirmedEvent,
      origin,
      'cancel',
      editToken,
      '',
      previous?.group
    )
    await sendTemplatedMail(template, 'fi', emailFrom, [secretaryEmail], templateData)
  } catch (e) {
    logger.error('error notifying cancellation to secretary', { error: e, eventId: registration.eventId })
  }
}

interface SendRegistrationEmailOptions {
  confirmedEvent: JsonConfirmedEvent
  context: RegistrationTemplateContext
  origin: string
  /** The registration as it was before the change, for the secretary's cancellation notice. */
  previous?: JsonRegistration
  registration: JsonRegistration
  user: Actor
}

/** The registration email for the change, recorded in the audit trail; a delivery failure from before is cleared first. */
const sendRegistrationEmail = async ({
  confirmedEvent,
  context,
  origin,
  previous,
  registration,
  user,
}: SendRegistrationEmailOptions) => {
  const editToken = await getRegistrationEditToken(registration)
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
    ...auditUser(user),
  })

  if (context === 'cancel') {
    await notifySecretaryOfCancellation(registration, confirmedEvent, origin, editToken, previous)
  }
}

/** Gives a registration its identity and creation stamp. */
export const initializeNewRegistration = (
  registration: Patch<JsonRegistration>,
  timestamp: string,
  user: Actor,
  state: 'creating' | 'ready'
): void => {
  registration.id = nanoid(10)
  registration.editTokenVersion = DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION
  registration.createdAt = timestamp
  registration.createdBy = user.name
  registration.state = state
}

interface CompleteNewRegistrationOptions {
  /** What the audit trail says of the creation. */
  auditMessage: string
  confirmedEvent: JsonConfirmedEvent
  groupPatches: Patch<JsonRegistration>[]
  origin: string
  registration: JsonRegistration
  user: Actor
}

/**
 * The phases after a new registration is stored, each once even across retries: the stats, the
 * audit entry, the confirmation email and the broadcast. A registration that is ready on arrival
 * gets all of them now; one awaiting payment is counted, published and confirmed by the payment.
 */
export const completeNewRegistration = async ({
  auditMessage,
  confirmedEvent,
  groupPatches,
  origin,
  registration,
  user,
}: CompleteNewRegistrationOptions): Promise<JsonRegistration> => {
  const claim = await claimNewRegistrationPostProcessing(registration.eventId, registration.id)
  // A concurrent request with the same creation key may arrive while the original request is
  // completing these phases. Its owner will finish the workflow; returning the durable
  // registration makes the retry idempotent.
  if (!claim) return registration

  const saved = claim.registration
  try {
    if (saved.newRegistrationProcessedAt) return saved

    const ready = saved.state === 'ready'
    const event = ready ? await recountRegistrations(saved.eventId) : confirmedEvent
    const phase = (name: Parameters<typeof markNewRegistrationPhase>[3]) =>
      markNewRegistrationPhase(saved.eventId, saved.id, claim.token, name)

    if (!saved.newRegistrationStatsAt) {
      await applyNewRegistrationStatsOnce(saved, event, claim.token)
    }
    if (!saved.newRegistrationAuditAt) {
      await auditStrict(
        { auditKey: registrationAuditKey(saved), message: auditMessage, ...auditUser(user) },
        saved.createdAt
      )
      await auditDateMismatch(saved, event, user)
      await phase('newRegistrationAuditAt')
    }
    if (ready && hasEmailRecipients(saved) && !saved.newRegistrationEmailSentAt) {
      await sendRegistrationEmail({ confirmedEvent: event, context: '', origin, registration: saved, user })
      await phase('newRegistrationEmailSentAt')
    }
    if (ready && !saved.newRegistrationPublishedAt) {
      await publishRegistrationChange(event, saved, undefined, groupPatches, true)
      await phase('newRegistrationPublishedAt')
    }
    await phase('newRegistrationProcessedAt')
    return saved
  } finally {
    await claim.release()
  }
}

interface ResolveDuplicateRegistrationOptions
  extends Omit<CompleteNewRegistrationOptions, 'groupPatches' | 'registration'> {
  /** The registration already in the event for the same dog. */
  duplicate: JsonRegistration
  /** The registration the request asked to create. */
  registration: Patch<JsonRegistration>
}

type ResolvedDuplicateRegistration = { conflict: JsonRegistration } | { completed: JsonRegistration; editToken: string }

/**
 * A second registration for a dog already in the event: the retry of a creation that did not
 * finish completes it, anything else is a conflict. The ready registrations' groups are repaired
 * first either way, and a repair that moved someone is broadcast even when the request is refused.
 */
export const resolveDuplicateRegistration = async ({
  duplicate,
  registration,
  ...options
}: ResolveDuplicateRegistrationOptions): Promise<ResolvedDuplicateRegistration> => {
  const groupPatches = await repairReadyRegistrationGroups(duplicate.eventId, options.user)
  const isIdempotentRetry =
    typeof registration.creationIdempotencyKey === 'string' &&
    registration.creationIdempotencyKey === duplicate.creationIdempotencyKey
  if (!isIdempotentRetry) {
    if (groupPatches.length) {
      const recounted = await recountRegistrations(duplicate.eventId)
      await publishRegistrationPatches(duplicate.eventId, groupPatches, recounted.organizer.id)
      await publishPublicStartList(recounted)
    }
    return { conflict: duplicate }
  }

  const completed = await completeNewRegistration({ ...options, groupPatches, registration: duplicate })
  return { completed, editToken: await getRegistrationEditToken(completed) }
}

interface FinalizeRegistrationUpdateOptions {
  existing: JsonRegistration
  flags?: RegistrationUpdateFlags
  groupPatches: Patch<JsonRegistration>[]
  origin: string
  registration: JsonRegistration
  user: Actor
}

/**
 * Everything that follows a stored edit: the counters, the stats, the broadcast, the audit trail
 * and the email telling the participant what changed.
 */
export const finalizeRegistrationUpdate = async ({
  existing,
  flags = PLAIN_UPDATE,
  groupPatches,
  origin,
  registration,
  user,
}: FinalizeRegistrationUpdateOptions): Promise<void> => {
  const confirmedEvent = await recountRegistrations(registration.eventId)
  await updateEventStatsForRegistration(registration, existing, confirmedEvent)
  await publishRegistrationChange(confirmedEvent, registration, existing, groupPatches, false)

  const message = updateAuditMessage(flags, registration, existing)
  if (message) await audit({ auditKey: registrationAuditKey(registration), message, ...auditUser(user) })

  const datesChanged =
    existing.class !== registration.class || JSON.stringify(existing.dates) !== JSON.stringify(registration.dates)
  if (datesChanged && !registration.cancelled) await auditDateMismatch(registration, confirmedEvent, user)

  if (hasEmailRecipients(registration)) {
    await sendRegistrationEmail({
      confirmedEvent,
      context: emailContext(flags),
      origin,
      previous: existing,
      registration,
      user,
    })
  }
}
