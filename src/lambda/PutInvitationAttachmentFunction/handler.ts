import type { JsonConfirmedEvent } from '../../types'

import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { getEvent } from '../lib/event'
import { deleteFile, parsePostFile, uploadFile } from '../lib/file'
import { getParam, lambda } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { response } from '../utils/response'

const { eventTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

const putInvitationAttachmentLambda = lambda('putInvitationAttachment', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const eventId = getParam(event, 'eventId')
  const existing = await getEvent<JsonConfirmedEvent>(eventId)
  if (!user.admin && !user.roles?.[existing?.organizer?.id ?? '']) {
    return response(403, 'Forbidden', event)
  }

  /** @todo remove an existing attachment? */

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

  await dynamoDB.update(
    { id: eventId },
    'set #attachment = :attachment',
    {
      '#attachment': 'invitationAttachment',
    },
    {
      ':attachment': key,
    }
  )

  return response(200, key, event)
})

export default putInvitationAttachmentLambda
