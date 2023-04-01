import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import {
  EmailTemplateId,
  JsonConfirmedEvent,
  JsonRegistration,
  JsonRegistrationGroupInfo,
  RegistrationMessage,
} from 'koekalenteri-shared/model'

import { getOrigin } from '../../utils/auth'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../../utils/metrics'
import { emailTo, registrationEmailTemplateData } from '../../utils/registration'
import { response } from '../../utils/response'
import { EMAIL_FROM, sendTemplatedMail } from '../email'
import { markParticipantsPicked, updateRegistrations } from '../event'

const dynamoDB = new CustomDynamoClient()
const eventTable = process.env.EVENT_TABLE_NAME || ''

const groupKey = <T extends JsonRegistration>(reg: T) => {
  if (reg.cancelled) {
    return 'cancelled'
  }
  return reg.group?.key ?? 'reserve'
}

const numberGroupKey = <T extends JsonRegistration>(reg: T) => {
  const ct = reg.class ?? reg.eventType
  if (reg.cancelled) {
    return 'cancelled-' + ct
  }
  if (reg.group?.date) {
    return `${reg.group?.date}-${ct}`
  }
  return 'reserve-' + ct
}

const byKeyAndNumber = <T extends JsonRegistration>(a: T, b: T): number =>
  a.group?.key === b.group?.key
    ? (a.group?.number || 999) - (b.group?.number || 999)
    : (a.group?.key ?? '').localeCompare(b.group?.key ?? '')

export async function fixGroups<T extends JsonRegistration>(items: T[]): Promise<T[]> {
  items.sort(byKeyAndNumber)

  const grouped: Record<string, T[]> = {}
  for (const item of items) {
    const groupKey = numberGroupKey(item)
    grouped[groupKey] = grouped[groupKey] || [] // make sure the array exists
    grouped[groupKey].push(item)
  }
  for (const regs of Object.values(grouped)) {
    regs.forEach(async (reg, index) => {
      const key = groupKey(reg)
      const number = index + 1
      if (reg.group?.key !== key || reg.group?.number !== number) {
        reg.group = { ...reg.group, key, number }
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
        return response(200, itemsWithGroups, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getRegistrations')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)

async function saveGroup({ eventId, id, group }: JsonRegistrationGroupInfo) {
  return dynamoDB.update(
    { eventId, id },
    'set #grp = :value, #cancelled = :cancelled',
    {
      '#grp': 'group',
      '#cancelled': 'cancelled',
    },
    {
      ':value': { ...group }, // https://stackoverflow.com/questions/37006008/typescript-index-signature-is-missing-in-type
      ':cancelled': group?.key === 'cancelled',
    }
  )
}

const isParticipantGroup = (group?: string) => group && group !== 'reserve' && group !== 'cancelled'

export const putRegistrationGroupsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const origin = getOrigin(event)
        const eventId = event.pathParameters?.eventId ?? ''
        const groups: JsonRegistrationGroupInfo[] = JSON.parse(event.body || '')

        if (!groups) {
          throw new Error('no groups!')
        }

        const eventGroups = groups.filter((g) => g.eventId === eventId)

        const oldItems = await dynamoDB.query<JsonRegistration>('eventId = :eventId', {
          ':eventId': eventId,
        })

        for (const group of eventGroups) {
          await saveGroup(group)
        }

        const items = await dynamoDB.query<JsonRegistration>('eventId = :eventId', {
          ':eventId': eventId,
        })
        const itemsWithGroups = await fixGroups(items ?? [])
        const confirmedEvent = await updateRegistrations(eventId, eventTable, dynamoDB.table)
        const { classes, entries } = confirmedEvent
        const cls = itemsWithGroups[0].class

        const emails = { pickedOk: [], pickedFailed: [], reserveOk: [], reserveFailed: [] }
        if (
          (cls && classes.find((c) => c.class === cls && c.state === 'picked')) ||
          confirmedEvent.state === 'picked'
        ) {
          /**
           * When event/class has already been 'picked', registrations moved from reserve to participants receive 'picked' email
           */
          const oldReserve = oldItems?.filter((reg) => reg.group?.key === 'reserve') ?? []
          const newParticipants = itemsWithGroups.filter(
            (reg) =>
              reg.class === cls && isParticipantGroup(reg.group?.key) && oldReserve.find((old) => old.id === reg.id)
          )

          const { ok: pickedOk, failed: pickedFailed } = await sendTemplatedEmailToEventRegistrations(
            'picked',
            confirmedEvent,
            newParticipants,
            origin,
            ''
          )

          /**
           * Registrations in reserve group that moved up, receie updated 'reserve' email
           */
          const movedReserve = itemsWithGroups.filter(
            (reg) =>
              reg.class === cls &&
              reg.group?.key === 'reserve' &&
              oldReserve.find((old) => old.id === reg.id && (old.group?.number ?? 999) > (reg.group?.number ?? 999))
          )
          const { ok: reserveOk, failed: reserveFailed } = await sendTemplatedEmailToEventRegistrations(
            'reserve',
            confirmedEvent,
            movedReserve,
            origin,
            ''
          )
          Object.assign(emails, { pickedOk, pickedFailed, reserveOk, reserveFailed })
        }

        metricsSuccess(metrics, event.requestContext, 'putRegistrationGroups')
        return response(200, { items: itemsWithGroups, classes, entries, ...emails })
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

    let confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>({ id: eventId }, eventTable)

    if (!confirmedEvent) {
      throw new Error('Event not found!')
    }

    const { ok, failed } = await sendTemplatedEmailToEventRegistrations(
      template,
      confirmedEvent,
      registrations,
      origin,
      text
    )

    if (template === 'picked') {
      confirmedEvent = await markParticipantsPicked(confirmedEvent, registrations[0].class)
    }

    metricsSuccess(metrics, event.requestContext, 'sendMessageHandler')
    const { state, classes } = confirmedEvent
    return response(200, { ok, failed, classes, state })
  } catch (err) {
    console.error(err)
    if (err instanceof Error) {
      console.error(err.message)
    }
    metricsError(metrics, event.requestContext, 'sendMessageHandler')
    return response((err as AWSError).statusCode || 501, err)
  }
})

async function sendTemplatedEmailToEventRegistrations(
  template: EmailTemplateId,
  confirmedEvent: JsonConfirmedEvent,
  registrations: JsonRegistration[],
  origin: string | undefined,
  text: string
) {
  const ok: string[] = []
  const failed: string[] = []
  for (const registration of registrations) {
    const to = emailTo(registration)
    const data = registrationEmailTemplateData(registration, confirmedEvent, origin, '')
    try {
      await sendTemplatedMail(template, registration.language, EMAIL_FROM, to, { ...data, text })
      ok.push(...to)
    } catch (e) {
      failed.push(...to)
      console.error(e)
    }
  }
  return { ok, failed }
}
