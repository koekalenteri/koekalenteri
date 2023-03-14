import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import {
  JsonConfirmedEvent,
  JsonRegistration,
  JsonRegistrationGroupInfo,
  RegistrationMessage,
} from 'koekalenteri-shared/model'

import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { getOrigin } from '../../utils/genericHandlers'
import { metricsError, metricsSuccess } from '../../utils/metrics'
import { emailTo, registrationEmailTemplateData } from '../../utils/registration'
import { response } from '../../utils/response'
import { EMAIL_FROM, sendTemplatedMail } from '../email'

const dynamoDB = new CustomDynamoClient()

const listKey = <T extends JsonRegistrationGroupInfo>(reg: T) => {
  if (reg.cancelled) {
    return 'cancelled'
  }
  return reg.group?.key ?? 'reserve'
}

export async function fixGroups<T extends JsonRegistrationGroupInfo>(items: T[]): Promise<T[]> {
  const byGroup: Record<string, T[]> = { cancelled: [], reserve: [] }
  for (const item of items) {
    const key = listKey(item)
    byGroup[key] = byGroup[key] || [] // make sure the array exists
    byGroup[key].push(item)
  }
  for (const [key, regs] of Object.entries(byGroup)) {
    regs.sort((a, b) => (a.group?.number || 999) - (b.group?.number || 999))
    regs.forEach(async (reg, index) => {
      if (reg.group?.key !== key || reg.group?.number !== index + 1) {
        reg.group = { ...reg.group, key, number: index + 1 }
        await saveGroup(reg)
      }
    })
  }

  return items
}

export const getRegistrationsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const items = await dynamoDB.query<JsonRegistration>('eventId = :eventId', {
          ':eventId': event.pathParameters?.eventId,
        })
        const itemsWithGroups = await fixGroups(items ?? [])
        metricsSuccess(metrics, event.requestContext, 'getRegistrations')
        return response(200, itemsWithGroups)
      } catch (err: unknown) {
        metricsError(metrics, event.requestContext, 'getRegistrations')
        return response((err as AWSError).statusCode || 501, err)
      }
    }
)

async function saveGroup({
  eventId,
  id,
  group,
  cancelled,
}: Pick<JsonRegistration, 'id' | 'eventId' | 'group' | 'cancelled'>) {
  console.log({ eventId, id })
  return dynamoDB.update(
    { eventId, id },
    'set #grp = :value, #cancelled = :cancelled',
    {
      '#grp': 'group',
      '#cancelled': 'cancelled',
    },
    {
      ':value': { ...group }, // https://stackoverflow.com/questions/37006008/typescript-index-signature-is-missing-in-type
      ':cancelled': cancelled ?? false,
    }
  )
}

export const putRegistrationGroupsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const eventId = event.pathParameters?.eventId ?? ''
        const groups: JsonRegistrationGroupInfo[] = JSON.parse(event.body || '')

        if (!groups) {
          throw new Error('no groups!')
        }

        for (const group of groups) {
          if (group.eventId === eventId) {
            await saveGroup(group)
          }
        }

        const items = await dynamoDB.query<JsonRegistration>('eventId = :eventId', {
          ':eventId': event.pathParameters?.eventId,
        })
        const itemsWithGroups = await fixGroups(items ?? [])

        metricsSuccess(metrics, event.requestContext, 'putRegistrationGroups')
        return response(200, itemsWithGroups)
      } catch (err) {
        console.error(err)
        if (err instanceof Error) {
          console.error(err.message)
        }
        metricsError(metrics, event.requestContext, 'putRegistrationGroups')
        return response((err as AWSError).statusCode || 501, err)
      }
    }
)

export const sendMessagesHandler = metricScope((metrics: MetricsLogger) => async (event: APIGatewayProxyEvent) => {
  const origin = getOrigin(event)

  try {
    const message: RegistrationMessage = JSON.parse(event.body ?? '')
    const { template, eventId, registrationIds, text } = message

    const eventRegistrations = await dynamoDB.query<JsonRegistration>('eventId = :eventId', { ':eventId': eventId })
    const registrations = eventRegistrations?.filter((r) => registrationIds.includes(r.id))

    if (registrations?.length !== registrationIds.length) {
      throw new Error('Not all registrations were found, aborting!')
    }

    const eventTable = process.env.EVENT_TABLE_NAME || ''
    const confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>({ id: eventId }, eventTable)

    if (!confirmedEvent) {
      throw new Error('Event not found!')
    }

    for (const registration of registrations) {
      const to = emailTo(registration)
      const data = registrationEmailTemplateData(registration, confirmedEvent, origin, '')
      await sendTemplatedMail(template, registration.language, EMAIL_FROM, to, { ...data, text })
    }

    metricsSuccess(metrics, event.requestContext, 'sendMessageHandler')
    return response(200, registrations.length)
  } catch (err) {
    console.error(err)
    if (err instanceof Error) {
      console.error(err.message)
    }
    metricsError(metrics, event.requestContext, 'sendMessageHandler')
    return response((err as AWSError).statusCode || 501, err)
  }
})
