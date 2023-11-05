import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonEvent, JsonRegistration } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { addDays, differenceInDays, parseISO } from 'date-fns'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { authorize } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const { eventTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

const copyEventWithRegistrations = metricScope(
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
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default copyEventWithRegistrations
