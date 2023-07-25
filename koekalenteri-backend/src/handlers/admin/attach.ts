import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonConfirmedEvent } from 'koekalenteri-shared/model'

import { metricScope } from 'aws-embedded-metrics'
import { nanoid } from 'nanoid'

import { parsePostFile, uploadFile } from '../../lib/file'
import { authorize } from '../../utils/auth'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../../utils/metrics'
import { response } from '../../utils/response'

const dynamoDB = new CustomDynamoClient()
const eventTable = process.env.EVENT_TABLE_NAME ?? ''

export const putInvitationAttachmentHandler = metricScope(
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
          return response(400, file.error, event)
        }

        const key = nanoid()
        await uploadFile(key, file.data)

        const eventKey = { id: eventId }
        await dynamoDB.update(
          eventKey,
          'set #attachment = :attachment',
          {
            '#attachment': 'invitationAttachment',
          },
          {
            ':attachment': key,
          },
          eventTable
        )

        const items = await dynamoDB.readAll()
        metricsSuccess(metrics, event.requestContext, 'putInvitationAttachment')
        return response(200, items, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'putInvitationAttachment')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)
