import type { SNSEvent } from 'aws-lambda'
import type { EmailTemplateId, JsonConfirmedEvent, JsonEmailDeliveryStatus, JsonEmailSuppression } from '../../types'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { getEvent } from '../lib/event'
import { publishRegistrationPatches } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { emailSuppressionTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)
const emailSuppressionDynamoDB = new CustomDynamoClient(emailSuppressionTable)

type SesNotification = {
  bounce?: {
    bouncedRecipients?: Array<{ diagnosticCode?: string; emailAddress?: string; status?: string }>
    bounceSubType?: string
    bounceType?: string
    timestamp?: string
  }
  complaint?: {
    complainedRecipients?: Array<{ emailAddress?: string }>
    complaintFeedbackType?: string
    timestamp?: string
  }
  eventType?: string
  mail?: {
    tags?: Record<string, string[]>
    timestamp?: string
  }
  notificationType?: string
}

const getTag = (notification: SesNotification, key: string) => notification.mail?.tags?.[key]?.[0]

const isEmailTemplateId = (value: string | undefined): value is EmailTemplateId => Boolean(value)

const parseNotification = (message: string): SesNotification | undefined => {
  try {
    return JSON.parse(message) as SesNotification
  } catch (error) {
    console.error('Failed to parse SES notification', error)
    return undefined
  }
}

const buildDeliveryStatus = (notification: SesNotification): JsonEmailDeliveryStatus | undefined => {
  const template = getTag(notification, 'template')

  if (notification.notificationType === 'Bounce' || notification.eventType === 'Bounce') {
    const recipient = notification.bounce?.bouncedRecipients?.[0]
    if (!recipient?.emailAddress) return undefined

    return {
      at: notification.bounce?.timestamp ?? notification.mail?.timestamp ?? new Date().toISOString(),
      email: recipient.emailAddress,
      reason: recipient.diagnosticCode ?? recipient.status ?? notification.bounce?.bounceSubType,
      status: 'bounce',
      ...(isEmailTemplateId(template) ? { template } : undefined),
    }
  }

  if (notification.notificationType === 'Complaint' || notification.eventType === 'Complaint') {
    const recipient = notification.complaint?.complainedRecipients?.[0]
    if (!recipient?.emailAddress) return undefined

    return {
      at: notification.complaint?.timestamp ?? notification.mail?.timestamp ?? new Date().toISOString(),
      email: recipient.emailAddress,
      reason: notification.complaint?.complaintFeedbackType,
      status: 'complaint',
      ...(isEmailTemplateId(template) ? { template } : undefined),
    }
  }

  return undefined
}

const formatAuditMessage = (status: JsonEmailDeliveryStatus) => {
  const type = status.status === 'bounce' ? 'palautui' : 'merkittiin roskapostiksi'
  const template = status.template ? `, template: ${status.template}` : ''
  const reason = status.reason ? `, reason: ${status.reason}` : ''
  return `Sähköpostin toimitus epäonnistui (${type}): ${status.email}${template}${reason}`
}

const writeEmailSuppression = async (eventId: string, registrationId: string, status: JsonEmailDeliveryStatus) => {
  const emailSuppression: JsonEmailSuppression = {
    email: status.email.trim().toLowerCase(),
    eventId,
    registrationId,
    status: status.status,
    updatedAt: status.at,
    ...(status.reason ? { reason: status.reason } : undefined),
    ...(status.template ? { template: status.template } : undefined),
  }

  await emailSuppressionDynamoDB.write(emailSuppression)
}

const handleNotification = async (notification: SesNotification) => {
  const eventId = getTag(notification, 'eventId')
  const registrationId = getTag(notification, 'registrationId')
  const status = buildDeliveryStatus(notification)

  if (!eventId || !registrationId || !status) {
    return
  }

  await dynamoDB.update(
    { eventId, id: registrationId },
    {
      set: {
        emailDeliveryStatus: status,
      },
    }
  )
  await writeEmailSuppression(eventId, registrationId, status)
  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)
  await publishRegistrationPatches(
    eventId,
    [{ emailDeliveryStatus: status, eventId, id: registrationId }],
    confirmedEvent.organizer.id
  )

  await audit({
    auditKey: registrationAuditKey({ eventId, id: registrationId }),
    message: formatAuditMessage(status),
    user: 'system',
  })
}

const sesNotificationLambda = async (event: SNSEvent) => {
  for (const record of event.Records ?? []) {
    const notification = parseNotification(record.Sns.Message)
    if (notification) {
      await handleNotification(notification)
    }
  }
}

export default sesNotificationLambda
