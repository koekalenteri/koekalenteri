import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import { JsonConfirmedEvent, JsonRegistration } from 'koekalenteri-shared/model'
import { v4 as uuidv4 } from 'uuid'

import CustomDynamoClient from '../utils/CustomDynamoClient'
import { authorize, genericReadAllHandler, genericReadHandler, getUsername } from '../utils/genericHandlers'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()

export const getEventsHandler = genericReadAllHandler(dynamoDB, 'getEvents')
export const getEventHandler = genericReadHandler(dynamoDB, 'getEvent')
export const putEventHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      authorize(event)

      const timestamp = new Date().toISOString()
      const username = getUsername(event)

      try {
        let existing
        const item: JsonConfirmedEvent = JSON.parse(event.body || '')
        if (item.id) {
          existing = await dynamoDB.read<JsonConfirmedEvent>({ id: item.id })
        } else {
          item.id = uuidv4()
          item.createdAt = timestamp
          item.createdBy = username
        }

        if (
          existing?.state === 'confirmed' &&
          existing.entryEndDate &&
          !existing.entryOrigEndDate &&
          item.entryEndDate &&
          item.entryEndDate > existing.entryEndDate
        ) {
          // entry period was extended, use additional field to store the original entry end date
          item.entryOrigEndDate = existing.entryEndDate
        }

        // modification info is always updated
        item.modifiedAt = timestamp
        item.modifiedBy = username

        const data = { ...existing, ...item }
        await dynamoDB.write(data)
        metricsSuccess(metrics, event.requestContext, 'putEvent')
        return response(200, data)
      } catch (err) {
        metricsError(metrics, event.requestContext, 'putEvent')
        return response((err as AWSError).statusCode || 501, err)
      }
    }
)

export const updateRegistrations = async (eventId: string, eventTable: string, registrationsTable: string) => {
  const eventKey = { id: eventId }

  const confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>(eventKey, eventTable)
  if (!confirmedEvent) {
    throw new Error(`Event with id "${eventId}" not found`)
  }

  const allRegistrations = await dynamoDB.query<JsonRegistration>(
    'eventId = :id',
    {
      ':id': eventId,
    },
    registrationsTable
  )
  const registrations = allRegistrations?.filter((r) => !r.cancelled)

  const membershipPriority = (r: JsonRegistration) =>
    (confirmedEvent.allowHandlerMembershipPriority && r.handler?.membership) ||
    (confirmedEvent.allowOwnerMembershipPriority && r.owner?.membership)

  const classes = confirmedEvent.classes || []
  for (const cls of classes) {
    const regsToClass = registrations?.filter((r) => r.class === cls.class)
    cls.entries = regsToClass?.length
    cls.members = regsToClass?.filter((r) => membershipPriority(r)).length
  }
  const entries = registrations?.length || 0
  await dynamoDB.update(
    eventKey,
    'set #entries = :entries, #classes = :classes',
    {
      '#entries': 'entries',
      '#classes': 'classes',
    },
    {
      ':entries': entries,
      ':classes': classes,
    },
    eventTable
  )

  return confirmedEvent
}

export const markParticipantsPicked = async (confirmedEvent: JsonConfirmedEvent, eventClass?: string) => {
  const eventKey = { id: confirmedEvent.id }
  const eventTable = process.env.EVENT_TABLE_NAME || ''
  let allInvited = true
  if (eventClass) {
    for (const c of confirmedEvent.classes) {
      if (c.class === eventClass) {
        c.state = 'picked'
      }
    }
    allInvited = confirmedEvent.classes.filter((c) => c.state === 'picked').length === confirmedEvent.classes.length
  }
  if (allInvited) {
    confirmedEvent.state = 'picked'
  }

  await dynamoDB.update(
    eventKey,
    'set #classes = :classes, #state = :state',
    {
      '#classes': 'classes',
      '#state': 'state',
    },
    {
      ':classes': confirmedEvent.classes,
      ':state': confirmedEvent.state,
    },
    eventTable
  )

  return confirmedEvent
}
