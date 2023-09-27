import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { EventClassState, JsonConfirmedEvent, JsonEvent, JsonRegistration } from 'koekalenteri-shared/model'

import { metricScope } from 'aws-embedded-metrics'
import { addDays, differenceInDays, parseISO } from 'date-fns'
import { nanoid } from 'nanoid'

import { CONFIG } from '../../config'
import { authorize } from '../../utils/auth'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../../utils/metrics'
import { response } from '../../utils/response'

const dynamoDB = new CustomDynamoClient()
const { eventTable, registrationTable } = CONFIG

export const putEventHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const user = await authorize(event)
      if (!user) {
        return response(401, 'Unauthorized', event)
      }

      const timestamp = new Date().toISOString()

      try {
        let existing
        const item: JsonConfirmedEvent = JSON.parse(event.body || '{}')
        if (item.id) {
          existing = await dynamoDB.read<JsonConfirmedEvent>({ id: item.id })
          if (!user.admin && !user.roles?.[existing?.organizer?.id ?? '']) {
            return response(403, 'Forbidden', event)
          }
        } else {
          item.id = nanoid(10)
          item.createdAt = timestamp
          item.createdBy = user.name
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
        item.modifiedBy = user.name

        const data = { ...existing, ...item }
        if (!user.admin && !user.roles?.[data.organizer?.id ?? '']) {
          return response(403, 'Forbidden', event)
        }
        await dynamoDB.write(data)
        metricsSuccess(metrics, event.requestContext, 'putEvent')
        return response(200, data, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'putEvent')
        return response((err as AWSError).statusCode || 501, err, event)
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
    Boolean(confirmedEvent.priority?.includes('member') && (r.handler?.membership || r.owner?.membership))

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

export const markParticipants = async (
  confirmedEvent: JsonConfirmedEvent,
  state: EventClassState,
  eventClass?: string
) => {
  const eventKey = { id: confirmedEvent.id }
  let allInvited = true
  if (eventClass) {
    for (const c of confirmedEvent.classes) {
      if (c.class === eventClass) {
        c.state = state
      }
    }
    allInvited = confirmedEvent.classes.filter((c) => c.state === state).length === confirmedEvent.classes.length
  }
  if (allInvited) {
    confirmedEvent.state = state
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

export const copyEventWithRegistrations = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const user = await authorize(event)
      if (!user) {
        return response(401, 'Unauthorized', event)
      }

      const timestamp = new Date().toISOString()

      try {
        const { id, startDate }: { id: string; startDate: string } = JSON.parse(event.body || '{}')
        const item = await dynamoDB.read<JsonEvent>({ id })

        if (!item) {
          return response(404, 'NotFound', event)
        }

        item.id = nanoid(10)
        item.name = 'Kopio - ' + (item.name ?? '')
        item.state = 'draft'
        item.createdAt = timestamp
        item.createdBy = user.name
        delete item.entryOrigEndDate

        // modification info is always updated
        item.modifiedAt = timestamp
        item.modifiedBy = user.name

        const days = differenceInDays(parseISO(startDate), parseISO(item.startDate))
        item.startDate = addDays(parseISO(item.startDate), days).toISOString()
        item.endDate = addDays(parseISO(item.endDate), days).toISOString()
        if (item.entryStartDate) item.entryStartDate = addDays(parseISO(item.entryStartDate), days).toISOString()
        if (item.entryEndDate) item.entryEndDate = addDays(parseISO(item.entryEndDate), days).toISOString()

        item.classes.forEach((c) => {
          if (c.date) c.date = addDays(parseISO(c.date), days).toISOString()
        })

        await dynamoDB.write(item)

        const registrations = await dynamoDB.query<JsonRegistration>(
          'eventId = :id',
          {
            ':id': id,
          },
          registrationTable
        )
        for (const reg of registrations ?? []) {
          reg.eventId = item.id
          reg.dates.forEach((d) => {
            d.date = addDays(parseISO(d.date), days).toISOString()
          })
          if (reg.group) {
            if (reg.group.date && reg.group.key) {
              reg.group.date = addDays(parseISO(reg.group.date), days).toISOString()
              reg.group.key = reg.group.date.slice(0, 10) + '-' + reg.group.time
            }
          }
          await dynamoDB.write(reg, registrationTable)
        }

        metricsSuccess(metrics, event.requestContext, 'copyEventWithRegistrations')
        return response(200, item, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'copyEventWithRegistrations')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)
