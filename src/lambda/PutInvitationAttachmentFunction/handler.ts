import { nanoid } from 'nanoid'
import { authorize } from '../auth/api'
import { eventRepository } from '../event/repository'
import { deleteFile, parsePostFile, uploadFile } from '../lib/file'
import { getParam, lambda, response } from '../lib/lambda'
import { eventReadPort } from '../registration/api'

export const putInvitationAttachmentLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const eventId = getParam(event, 'eventId')
  const existing = await eventReadPort.getConfirmedEvent(eventId)
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

  if (existing?.invitationAttachment) {
    await deleteFile(existing.invitationAttachment)
  }

  const key = nanoid()
  await uploadFile(key, file.data)

  await eventRepository.updateInvitationAttachment(eventId, key)

  return response(200, key, event)
}

export default lambda('putInvitationAttachment', putInvitationAttachmentLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
