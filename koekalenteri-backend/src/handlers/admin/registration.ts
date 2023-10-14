import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type {
  EmailTemplateId,
  JsonConfirmedEvent,
  JsonRegistration,
  JsonRegistrationGroupInfo,
  RegistrationMessage,
} from 'koekalenteri-shared/model'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../../config'
import { i18n } from '../../i18n'
import { audit, auditTrail, registrationAuditKey } from '../../lib/audit'
import { authorize, getOrigin } from '../../utils/auth'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { formatDate } from '../../utils/dates'
import { metricsError, metricsSuccess } from '../../utils/metrics'
import { emailTo, registrationEmailTemplateData } from '../../utils/registration'
import { response } from '../../utils/response'
import { sendTemplatedMail } from '../email'

import { markParticipants, updateRegistrations } from './event'

const dynamoDB = new CustomDynamoClient()
const { emailFrom, eventTable } = CONFIG

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
    return 'participants' //`${reg.group?.date}-${ct}`
  }
  return 'reserve-' + ct
}

const byTimeAndNumber = <T extends JsonRegistration>(a: T, b: T): number =>
  a.group?.time === b.group?.time
    ? (a.group?.number || 999) - (b.group?.number || 999)
    : (a.group?.time ?? '').localeCompare(b.group?.time ?? '')

const byClassTimeAndNumber = <T extends JsonRegistration>(a: T, b: T): number =>
  a.class === b.class ? byTimeAndNumber(a, b) : (a.class ?? '').localeCompare(b.class ?? '')

const byDateClassTimeAndNumber = <T extends JsonRegistration>(a: T, b: T): number =>
  a.group?.date === b.group?.date
    ? byClassTimeAndNumber(a, b)
    : (a.group?.date ?? '').localeCompare(b.group?.date ?? '')

export async function fixGroups<T extends JsonRegistration>(items: T[]): Promise<T[]> {
  items.sort(byDateClassTimeAndNumber)

  const grouped: Record<string, T[]> = {}
  for (const item of items) {
    const groupKey = numberGroupKey(item)
    grouped[groupKey] = grouped[groupKey] || [] // make sure the array exists
    grouped[groupKey].push(item)
  }

  for (const regs of Object.values(grouped)) {
    for (let i = 0; i < regs.length; i++) {
      const reg = regs[i]
      const key = groupKey(reg)
      const number = i + 1
      if (reg.group?.key !== key || reg.group?.number !== number) {
        reg.group = { ...reg.group, key, number }
        await saveGroup(reg)
      }
    }
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
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export const getAuditTrailHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }
        const trail = await auditTrail(`${event.pathParameters?.eventId}:${event.pathParameters?.id}`)
        metricsSuccess(metrics, event.requestContext, 'getAuditTrail')
        return response(200, trail, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getAuditTrail')
        return response((err as AWSError).statusCode ?? 501, err, event)
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

const setLastEmail = async ({ eventId, id }: JsonRegistration, value: string) =>
  dynamoDB.update(
    { eventId, id },
    'set #field = :value',
    {
      '#field': 'lastEmail',
    },
    {
      ':value': value,
    }
  )

const setReserveNotified = async (registrations: JsonRegistration[]) =>
  Promise.all(
    registrations
      .filter((r) => !r.reserveNotified)
      .map(({ eventId, id }) =>
        dynamoDB.update(
          { eventId, id },
          'set #field = :value',
          {
            '#field': 'reserveNotified',
          },
          {
            ':value': true,
          }
        )
      )
  )

const isParticipantGroup = (group?: string) => group && group !== 'reserve' && group !== 'cancelled'

export const putRegistrationGroupsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          metricsError(metrics, event.requestContext, 'putRegistrationGroups')
          return response(401, 'Unauthorized', event)
        }
        const origin = getOrigin(event)
        const eventId = event.pathParameters?.eventId ?? ''
        const groups: JsonRegistrationGroupInfo[] = JSON.parse(event.body || '[]')

        if (!groups) {
          metricsError(metrics, event.requestContext, 'putRegistrationGroups')
          return response(422, 'no groups', event)
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

        const emails = {
          invitedOk: [],
          invitedFailed: [],
          pickedOk: [],
          pickedFailed: [],
          reserveOk: [],
          reserveFailed: [],
          cancelledOk: [],
          cancelledFailed: [],
        }
        if (
          confirmedEvent.state === 'picked' ||
          confirmedEvent.state === 'invited' ||
          (cls && classes.find((c) => c.class === cls && (c.state === 'picked' || c.state === 'invited')))
        ) {
          /**
           * When event/class has already been 'picked' or 'invited', registrations moved from reserve to participants receive 'picked' email
           */
          const oldResCan =
            oldItems?.filter((reg) => reg.group?.key === 'reserve' || reg.group?.key === 'cancelled') ?? []
          const newParticipants = itemsWithGroups.filter(
            (reg) =>
              reg.class === cls && isParticipantGroup(reg.group?.key) && oldResCan.find((old) => old.id === reg.id)
          )

          const { ok: pickedOk, failed: pickedFailed } = await sendTemplatedEmailToEventRegistrations(
            'picked',
            confirmedEvent,
            newParticipants,
            origin,
            '',
            user.name
          )

          const { ok: invitedOk, failed: invitedFailed } =
            confirmedEvent.state === 'invited'
              ? await sendTemplatedEmailToEventRegistrations(
                  'invitation',
                  confirmedEvent,
                  newParticipants,
                  origin,
                  '',
                  user.name
                )
              : { ok: [], failed: [] }

          /**
           * Registrations in reserve group that moved up, receive updated 'reserve' email
           */
          const movedReserve = itemsWithGroups.filter(
            (reg) =>
              reg.class === cls &&
              reg.group?.key === 'reserve' &&
              oldResCan.find(
                (old) =>
                  old.id === reg.id &&
                  old.group?.key === 'reserve' &&
                  (old.group?.number ?? 999) > (reg.group?.number ?? 999)
              )
          )
          const { ok: reserveOk, failed: reserveFailed } = await sendTemplatedEmailToEventRegistrations(
            'reserve',
            confirmedEvent,
            movedReserve,
            origin,
            '',
            user.name
          )

          /**
           * Registrations moved to cancelled group receive "cancelled" email
           */
          const cancelled = itemsWithGroups.filter(
            (reg) =>
              reg.class === cls &&
              reg.group?.key === 'cancelled' &&
              oldResCan.find((old) => old.id === reg.id && old.group?.key !== 'cancelled')
          )
          const { ok: cancelledOk, failed: cancelledFailed } = await sendTemplatedEmailToEventRegistrations(
            'registration',
            confirmedEvent,
            cancelled,
            origin,
            '',
            user.name
          )

          Object.assign(emails, {
            invitedOk,
            invitedFailed,
            pickedOk,
            pickedFailed,
            reserveOk,
            reserveFailed,
            cancelledOk,
            cancelledFailed,
          })
        }

        metricsSuccess(metrics, event.requestContext, 'putRegistrationGroups')
        return response(200, { items: itemsWithGroups, classes, entries, ...emails }, event)
      } catch (err) {
        console.error(err)
        if (err instanceof Error) {
          console.error(err.message)
        }
        metricsError(metrics, event.requestContext, 'putRegistrationGroups')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export const sendMessagesHandler = metricScope((metrics: MetricsLogger) => async (event: APIGatewayProxyEvent) => {
  const origin = getOrigin(event)

  try {
    const user = await authorize(event)
    if (!user) {
      metricsError(metrics, event.requestContext, 'sendMessageHandler')
      return response(401, 'Unauthorized', event)
    }
    const message: RegistrationMessage = JSON.parse(event.body || '{}')
    const { template, eventId, registrationIds, text } = message

    const eventRegistrations = await dynamoDB.query<JsonRegistration>('eventId = :eventId', { ':eventId': eventId })
    const registrations = eventRegistrations?.filter((r) => registrationIds.includes(r.id))

    if (registrations?.length !== registrationIds.length) {
      metricsError(metrics, event.requestContext, 'sendMessageHandler')
      return response(400, 'Not all registrations were found, aborting!', event)
    }

    let confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>({ id: eventId }, eventTable)

    if (!confirmedEvent) {
      metricsError(metrics, event.requestContext, 'sendMessageHandler')
      return response(404, 'Event not found', event)
    }

    const { ok, failed } = await sendTemplatedEmailToEventRegistrations(
      template,
      confirmedEvent,
      registrations,
      origin,
      text,
      user.name
    )

    if (template === 'reserve') {
      await setReserveNotified(registrations)
    }

    if (template === 'picked' || template === 'invitation') {
      confirmedEvent = await markParticipants(
        confirmedEvent,
        template === 'invitation' ? 'invited' : template,
        registrations[0].class
      )
    }

    metricsSuccess(metrics, event.requestContext, 'sendMessageHandler')
    const { state, classes } = confirmedEvent
    return response(200, { ok, failed, classes, state }, event)
  } catch (err) {
    console.error(err)
    if (err instanceof Error) {
      console.error(err.message)
    }
    metricsError(metrics, event.requestContext, 'sendMessageHandler')
    return response((err as AWSError).statusCode ?? 501, err, event)
  }
})

async function sendTemplatedEmailToEventRegistrations(
  template: EmailTemplateId,
  confirmedEvent: JsonConfirmedEvent,
  registrations: JsonRegistration[],
  origin: string | undefined,
  text: string,
  user: string
) {
  const t = i18n.getFixedT('fi')
  const lastEmailDate = formatDate(new Date(), 'd.M.yyyy HH:mm')
  const templateName = t(`emailTemplate.${template}`)
  const ok: string[] = []
  const failed: string[] = []
  for (const registration of registrations) {
    const to = emailTo(registration)
    const data = registrationEmailTemplateData(registration, confirmedEvent, origin, '')
    try {
      await sendTemplatedMail(template, registration.language, emailFrom, to, { ...data, text })
      ok.push(...to)
      audit({
        auditKey: registrationAuditKey(registration),
        message: `${templateName}: ${to.join(', ')}`,
        user,
      })
      await setLastEmail(registration, `${templateName} ${lastEmailDate}`)
    } catch (e) {
      failed.push(...to)
      audit({
        auditKey: registrationAuditKey(registration),
        message: `FAILED ${templateName}: ${to.join(', ')}`,
        user,
      })
      console.error(e)
    }
  }
  return { ok, failed }
}
