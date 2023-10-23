import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonConfirmedEvent } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { deleteFile, parsePostFile, uploadFile } from '../lib/file'
import { authorize } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()
const { eventTable } = CONFIG

const putInvitationAttachmentHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }

        const eventId = event.pathParameters?.eventId ?? ''
        const existing = await dynamoDB.read<JsonConfirmedEvent>({ id: eventId })
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
          },
          eventTable
        )

        metricsSuccess(metrics, event.requestContext, 'putInvitationAttachment')
        return response(200, key, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'putInvitationAttachment')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default putInvitationAttachmentHandler
