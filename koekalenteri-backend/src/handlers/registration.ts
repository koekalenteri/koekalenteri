import { metricScope, MetricsLogger } from "aws-embedded-metrics"
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda"
import { AWSError } from "aws-sdk"
import { lightFormat, parseISO } from "date-fns"
import { JsonConfirmedEvent, JsonRegistration } from "koekalenteri-shared/model"
import { v4 as uuidv4 } from 'uuid'

import { i18n } from "../i18n/index"
import CustomDynamoClient from "../utils/CustomDynamoClient"
import { formatDateSpan } from "../utils/dates"
import { getOrigin, getUsername } from "../utils/genericHandlers"
import { metricsError, metricsSuccess } from "../utils/metrics"
import { response } from "../utils/response"
import { reverseName } from "../utils/string"

import { EmailTemplate, sendTemplatedMail } from "./email"

export const dynamoDB = new CustomDynamoClient()

export const getRegistrationHandler =  metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const item = await dynamoDB.read<JsonRegistration>(event.pathParameters)
      if (item) {
        // Make sure not to leak group information to user
        delete item.group
      }
      metricsSuccess(metrics, event.requestContext, 'getRegistration')
      return response(200, item)
    } catch (err) {
      metricsError(metrics, event.requestContext, 'getRegistration')
      return response((err as AWSError).statusCode || 501, err)
    }
  },
)

export const putRegistrationHandler = metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {

    const timestamp = new Date().toISOString()
    const username = getUsername(event)
    const origin = getOrigin(event)

    console.log(event.headers)
    console.log(event.requestContext)

    try {
      let existing
      const registration: JsonRegistration = JSON.parse(event.body || "")
      const update = !!registration.id
      let cancel = false
      if (update) {
        existing = await dynamoDB.read<JsonRegistration>({ eventId: registration.eventId, id: registration.id })
        if (!existing) {
          throw new Error(`Registration not found with id "${registration.id}"`)
        }
        cancel = !existing.cancelled && !!registration.cancelled
      } else {
        registration.id = uuidv4()
        registration.createdAt = timestamp
        registration.createdBy = username
      }

      // modification info is always updated
      registration.modifiedAt = timestamp
      registration.modifiedBy = username

      const t = i18n.getFixedT(registration.language)

      const eventKey = { id: registration.eventId }
      const eventTable = process.env.EVENT_TABLE_NAME || ''
      const confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>(eventKey, eventTable)
      if (!confirmedEvent) {
        throw new Error(`Event of type "${registration.eventType}" not found with id "${registration.eventId}"`)
      }

      const data = { ...existing, ...registration }
      await dynamoDB.write(data)

      const allRegistrations = await dynamoDB.query<JsonRegistration>('eventId = :id', { ':id': registration.eventId })
      const registrations = allRegistrations?.filter(r => !r.cancelled)

      const membershipPriority = (r: JsonRegistration) => (confirmedEvent.allowHandlerMembershipPriority && r.handler?.membership)
        || (confirmedEvent.allowOwnerMembershipPriority && r.owner?.membership)

      const classes = confirmedEvent.classes || []
      for (const cls of classes) {
        const regsToClass = registrations?.filter(r => r.class === cls.class)
        cls.entries = regsToClass?.length
        cls.members = regsToClass?.filter(r => membershipPriority(r)).length
      }
      const entries = registrations?.length || 0
      await dynamoDB.update(eventKey,
        'set #entries = :entries, #classes = :classes',
        {
          '#entries': 'entries',
          '#classes': 'classes',
        },
        {
          ':entries': entries,
          ':classes': classes,
        },
        eventTable,
      )

      if (registration.handler?.email && registration.owner?.email) {
        const to: string[] = [registration.handler.email]
        if (registration.owner.email !== registration.handler.email) {
          to.push(registration.owner.email)
        }
        const eventDate = formatDateSpan(confirmedEvent.startDate, confirmedEvent.endDate)
        const reserveText = t(`registration.reserveChoises.${registration.reserve}`)
        const dogBreed = t(`breed:${registration.dog.breedCode}`)
        const regDates = registration.dates.map(d => t('dateFormat.weekday', { date: d.date }) + (d.time ? (' ' + t(`registration.time.${d.time}`)) : '')).join(', ')
        const link = `${origin}/registration/${registration.eventType}/${registration.eventId}/${registration.id}`
        // TODO: sender address from env / other config
        const from = "koekalenteri@koekalenteri.snj.fi"
        const qualifyingResults = registration.qualifyingResults.map(r => ({ ...r, date: lightFormat(parseISO(r.date), 'd.M.yyyy') }))
        const context = getEmailContext(update, cancel)

        // Friendly name for secretary (and official) (KOE-350)
        confirmedEvent.secretary.name = reverseName(confirmedEvent.secretary.name)
        confirmedEvent.official.name = reverseName(confirmedEvent.official.name)

        await sendTemplatedMail(EmailTemplate.REGISTRATION, registration.language, from, to, {
          subject: t('registration.email.subject', { context }),
          title: t('registration.email.title', { context }),
          dogBreed,
          link,
          event: confirmedEvent,
          eventDate,
          qualifyingResults,
          reg: registration,
          regDates,
          reserveText,
        })
      }

      metricsSuccess(metrics, event.requestContext, 'putRegistration')
      return response(200, registration)
    } catch (err) {
      console.error(err)
      if (err instanceof Error) {
        console.error(err.message)
      }
      metricsError(metrics, event.requestContext, 'putRegistration')
      return response((err as AWSError).statusCode || 501, err)
    }
  },
)
function getEmailContext(update: boolean, cancel: boolean) {
  if (cancel) {
    return 'cancel'
  }
  if (update) {
    return 'update'
  }
  return ''
}
