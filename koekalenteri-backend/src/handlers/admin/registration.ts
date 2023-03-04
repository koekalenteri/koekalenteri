import { metricScope, MetricsLogger } from "aws-embedded-metrics"
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda"
import { AWSError } from "aws-sdk"
import { JsonConfirmedEvent, JsonRegistration, RegistrationMessage } from "koekalenteri-shared/model"

import CustomDynamoClient from "../../utils/CustomDynamoClient"
import { getOrigin } from "../../utils/genericHandlers"
import { metricsError, metricsSuccess } from "../../utils/metrics"
import { emailTo, registrationEmailTemplateData } from "../../utils/registration"
import { response } from "../../utils/response"
import { sendTemplatedMail } from "../email"

export const dynamoDB = new CustomDynamoClient()

export const getRegistrationsHandler = metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const items = await dynamoDB.query<JsonRegistration>('eventId = :eventId', { ':eventId': event.pathParameters?.eventId })
      metricsSuccess(metrics, event.requestContext, 'getRegistrations')
      return response(200, items)
    } catch (err: unknown) {
      metricsError(metrics, event.requestContext, 'getRegistrations')
      return response((err as AWSError).statusCode || 501, err)
    }
  },
)

export const putRegistrationGroupHandler = metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {

    console.log(event.headers)
    console.log(event.requestContext)

    try {
      const registration: JsonRegistration = JSON.parse(event.body || "")
      const key = { eventId: registration.eventId, id: registration.id }

      if (!registration.group) {
        throw new Error('no group for registration')
      }

      await dynamoDB.update(key,
        'set #grp = :value',
        {
          '#grp': 'group',
        },
        {
          ':value': {...registration.group}, // https://stackoverflow.com/questions/37006008/typescript-index-signature-is-missing-in-type
        },
      )

      metricsSuccess(metrics, event.requestContext, 'putRegistrationGroup')
      return response(200, registration)
    } catch (err) {
      console.error(err)
      if (err instanceof Error) {
        console.error(err.message)
      }
      metricsError(metrics, event.requestContext, 'putRegistrationGroup')
      return response((err as AWSError).statusCode || 501, err)
    }
  },
)

export const sendMessagesHandler = metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ) => {
    const origin = getOrigin(event)

    try {
      const message: RegistrationMessage = JSON.parse(event.body ?? '')
      const { template, from, eventId, registrationIds, text } = message

      const eventRegistrations = await dynamoDB.query<JsonRegistration>('eventId = :eventId', { ':eventId': eventId })
      const registrations = eventRegistrations?.filter(r => registrationIds.includes(r.id))

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
        await sendTemplatedMail(template, registration.language, from, to, { ...data, text })
      }

      metricsSuccess(metrics, event.requestContext, 'putRegistrationGroup')
      return response(200, registrations.length)
    } catch(err) {
      console.error(err)
      if (err instanceof Error) {
        console.error(err.message)
      }
      metricsError(metrics, event.requestContext, 'putRegistrationGroup')
      return response((err as AWSError).statusCode || 501, err)
    }
  },
)
