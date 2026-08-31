import type { JsonConfirmedEvent } from '../../types'
import { nanoid } from 'nanoid'
import { getRegistrationClass } from '../../lib/registration'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { getEvent } from '../lib/event'
import { deleteFile, parsePostFile, uploadFile } from '../lib/file'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { publishAdminEventPatch } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { eventTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

/**
 * The attachment being replaced can be dropped only when no registration still points at it, either
 * because it was already sent or read, or because it is the one an invitation yet to be sent used.
 */
const findStaleAttachment = async (
  eventId: string,
  oldAttachment: string | undefined,
  className: string | undefined
): Promise<string | undefined> => {
  if (!oldAttachment) return undefined

  const referenced = (await getRegistrationsByEventId(eventId)).some(
    (registration) =>
      registration.invitationAttachmentSent === oldAttachment ||
      registration.invitationAttachmentRead === oldAttachment ||
      (!registration.invitationAttachmentSent &&
        (!className || getRegistrationClass(registration) === className) &&
        (registration.messagesSent?.invitation || registration.invitationRead))
  )
  return referenced ? undefined : oldAttachment
}

/** Removing the replaced file is best effort: the event already points at the new one. */
const deleteStaleAttachment = async (key: string) => {
  try {
    await deleteFile(key)
  } catch (error) {
    console.error('Failed to delete unused invitation attachment', error)
  }
}

const putInvitationAttachmentLambda = lambda('putInvitationAttachment', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const eventId = getParam(event, 'eventId')
  const className = getParam(event, 'className')
  const existing = await getEvent<JsonConfirmedEvent>(eventId)
  if (!user.admin && !user.roles?.[existing.organizer.id]) {
    return response(403, 'Forbidden', event)
  }

  const file = await parsePostFile(event)
  if (file.error) {
    console.error(file.error)
    return response(400, file.error, event)
  }

  if (!file.data) {
    console.error('no data')
    return response(400, 'no data', event)
  }

  // The attachment is stored and served as application/pdf, so require a PDF.
  if (!file.data.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    console.error('uploaded file is not a PDF')
    return response(400, 'file is not a PDF', event)
  }

  const existingClassAttachments = existing.invitationAttachments ?? {}
  const oldAttachment = className ? existingClassAttachments[className] : existing.invitationAttachment
  const staleAttachment = await findStaleAttachment(eventId, oldAttachment, className)
  const key = nanoid()
  await uploadFile(key, file.data)
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

  await dynamoDB.update(
    { id: eventId },
    {
      set,
    }
  )
  await publishAdminEventPatch({ eventId, ...set }, existing.organizer.id)

  if (staleAttachment) await deleteStaleAttachment(staleAttachment)

  return response(200, { invitationAttachmentHistory, key, uploadedAt }, event)
})

export default putInvitationAttachmentLambda
