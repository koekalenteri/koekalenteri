import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonConfirmedEvent } from '../../types'
import type { UploadRejection } from '../lib/file'
import { nanoid } from 'nanoid'
import { uniqueClasses } from '../../lib/event'
import { getRegistrationClass } from '../../lib/registration'
import { authorize } from '../lib/auth'
import { getEvent } from '../lib/event'
import { deleteFile, parsePostFile, uploadFile } from '../lib/file'
import { getParam, httpError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { writeEventFields } from '../lib/repositories/eventRepository'
import { readEventRegistrations } from '../lib/repositories/registrationRepository'
import { publishAdminEventPatch } from '../lib/ws/actions'

/**
 * The attachment being replaced can be dropped only when no registration still points at it, either
 * because it was already sent or read, or because it is the one an invitation yet to be sent used.
 */
const findStaleAttachment = async (
  event: JsonConfirmedEvent,
  eventId: string,
  oldAttachment: string | undefined,
  className: string | undefined
): Promise<string | undefined> => {
  if (!oldAttachment) return undefined

  const referenced = (await readEventRegistrations(eventId)).some(
    (registration) =>
      registration.invitationAttachmentSent === oldAttachment ||
      registration.invitationAttachmentRead === oldAttachment ||
      (!registration.invitationAttachmentSent &&
        (!className || getRegistrationClass(registration, event) === className) &&
        (registration.messagesSent?.invitation || registration.invitationRead))
  )
  return referenced ? undefined : oldAttachment
}

/** Removing the replaced file is best effort: the event already points at the new one. */
const deleteStaleAttachment = async (key: string) => {
  try {
    await deleteFile(key)
  } catch (error) {
    logger.error('failed to delete unused invitation attachment', { error, key })
  }
}

// InfoPanel tells the secretary the file is too large only on a 413.
const REJECTION_ANSWERS: Record<UploadRejection, [status: number, body: string]> = {
  tooLarge: [413, 'file is too large'],
  tooManyFiles: [400, 'only one file is allowed'],
}

/** The one PDF the body carries, or the answer that refuses the body. */
const readAttachment = async (event: APIGatewayProxyEvent, eventId: string): Promise<Buffer> => {
  const file = await parsePostFile(event)
  if (file.rejection) {
    throw httpError(...REJECTION_ANSWERS[file.rejection])
  }

  if (file.error) {
    logger.error('invitation attachment could not be parsed', { error: file.error, eventId })
    throw httpError(400, file.error)
  }

  if (!file.data) {
    logger.error('invitation attachment has no data', { eventId })
    throw httpError(400, 'no data')
  }

  // The attachment is stored and served as application/pdf, so require a PDF.
  if (!file.data.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    logger.error('uploaded invitation attachment is not a PDF', { eventId })
    throw httpError(400, 'file is not a PDF')
  }

  return file.data
}

const putInvitationAttachmentLambda = lambda('putInvitationAttachment', async (event) => {
  const user = await authorize(event)
  if (!user) {
    throw httpError(401, 'Unauthorized')
  }

  const eventId = getParam(event, 'eventId')
  const className = getParam(event, 'className')
  const existing = await getEvent<JsonConfirmedEvent>(eventId)
  if (!user.admin && !user.roles?.[existing.organizer.id]) {
    throw httpError(403, 'Forbidden')
  }

  const eventClasses: readonly string[] = uniqueClasses(existing)
  // No class is the whole event's attachment.
  if (className && !eventClasses.includes(className)) {
    throw httpError(400, 'unknown class')
  }

  const data = await readAttachment(event, eventId)

  const existingClassAttachments = existing.invitationAttachments ?? {}
  const oldAttachment = className ? existingClassAttachments[className] : existing.invitationAttachment
  const staleAttachment = await findStaleAttachment(existing, eventId, oldAttachment, className)
  const key = nanoid()
  await uploadFile(key, data)
  const uploadedAt = new Date().toISOString()
  const previousInvitationAttachmentHistory = { ...existing.invitationAttachmentHistory }
  if (staleAttachment) delete previousInvitationAttachmentHistory[staleAttachment]
  const invitationAttachmentHistory = {
    ...previousInvitationAttachmentHistory,
    [key]: {
      ...(className ? { className } : {}),
      uploadedAt,
    },
  }

  const set = className
    ? {
        invitationAttachmentHistory,
        invitationAttachments: {
          ...existingClassAttachments,
          [className]: key,
        },
      }
    : {
        invitationAttachment: key,
        invitationAttachmentHistory,
      }

  await writeEventFields(eventId, { set })
  await publishAdminEventPatch({ eventId, ...set }, existing.organizer.id)

  if (staleAttachment) await deleteStaleAttachment(staleAttachment)

  return response(200, { invitationAttachmentHistory, key, uploadedAt }, event)
})

export default putInvitationAttachmentLambda
