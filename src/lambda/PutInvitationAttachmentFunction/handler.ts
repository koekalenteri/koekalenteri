import type { JsonConfirmedEvent } from '../../types'
import { nanoid } from 'nanoid'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { getEvent } from '../lib/event'
import { deleteFile, parsePostFile, uploadFile } from '../lib/file'
import { getParam, lambda, response } from '../lib/lambda'
import { publishAdminEventPatch } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { eventTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

const putInvitationAttachmentLambda = lambda('putInvitationAttachment', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const eventId = getParam(event, 'eventId')
  const className = getParam(event, 'className')
  const existing = await getEvent<JsonConfirmedEvent>(eventId)
  if (!user.admin && !user.roles?.[existing?.organizer?.id ?? '']) {
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

  const existingClassAttachments = existing?.invitationAttachments ?? {}
  const oldAttachment = className ? existingClassAttachments[className] : existing?.invitationAttachment
  if (oldAttachment) {
    await deleteFile(oldAttachment)
  }

  const key = nanoid()
  await uploadFile(key, file.data)

  const set = className
    ? {
        invitationAttachments: {
          ...existingClassAttachments,
          [className]: key,
        },
      }
    : {
        invitationAttachment: key,
      }

  await dynamoDB.update(
    { id: eventId },
    {
      set,
    }
  )
  await publishAdminEventPatch({ eventId, ...set }, existing.organizer.id)

  return response(200, key, event)
})

export default putInvitationAttachmentLambda
