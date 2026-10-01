import type { MessageTag, SendTemplatedEmailCommandInput } from '@aws-sdk/client-ses'
import type {
  EmailTemplateId,
  JsonConfirmedEvent,
  JsonRegistration,
  JsonRegistrationGroup,
  JsonUser,
  Language,
  RegistrationTemplateContext,
} from '../../types'
import { SESClient, SendTemplatedEmailCommand } from '@aws-sdk/client-ses'
import { getFixedT } from '../../i18n/lambda'
import { getPaymentBalance } from '../../lib/cost'
import { getRegistrationEmailTemplateData, getRegistrationOwners, isPayerTemplate } from '../../lib/registration'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { audit, registrationAuditKey } from './audit'
import { logger } from './log'

const ses = new SESClient()
const userDB = new CustomDynamoClient(CONFIG.userTable)

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/**
 * `name+anything@domain` → `name@domain`: from the first `+` to the `@` after it. Found with
 * indexOf rather than a pattern, which re-scanned from every `+` of a text without an `@` (KOE-1474).
 */
export const withoutPlusTag = (email: string) => {
  const address = normalizeEmail(email)
  const plus = address.indexOf('+')
  const at = plus < 0 ? -1 : address.indexOf('@', plus)
  return at < 0 ? address : address.slice(0, plus) + address.slice(at)
}

const staffAddresses = new Map<string, boolean>()

const isStaffUser = (user: JsonUser) =>
  !user.deletedAt && (user.admin === true || Object.values(user.roles ?? {}).some(Boolean))

const isStaffAddress = async (address: string): Promise<boolean> => {
  const cached = staffAddresses.get(address)
  if (cached !== undefined) return cached

  const users = await userDB.query<JsonUser>({
    index: 'gsiEmail',
    key: 'email = :email',
    values: { ':email': address },
  })
  const staff = users?.some(isStaffUser) ?? false
  staffAddresses.set(address, staff)
  return staff
}

/** The Amazon SES mailbox simulator: SES answers mail sent to it itself, and no person reads it. */
const SES_SIMULATOR_DOMAIN = 'simulator.amazonses.com'

/** Exactly that domain after the last `@`: not a subdomain, not a look-alike, not a longer name. */
const isSesSimulatorAddress = (address: string) => {
  const at = address.lastIndexOf('@')
  return at > 0 && address.slice(at + 1) === SES_SIMULATOR_DOMAIN
}

/**
 * Outside prod, mail goes only to the environment's own staff: users with admin rights or a role,
 * at their own address or a plus-address of it. Data copied from prod keeps nobody else reachable,
 * even through a field the copy failed to rewrite (KOE-1469).
 *
 * The SES mailbox simulator goes through as well, without a user lookup. A staff address is a real
 * mailbox and never bounces, so `bounce@simulator.amazonses.com` is how a tester makes a message
 * bounce and sees SesNotificationFunction mark the registration (KOE-1381).
 */
const deliverableRecipients = async (to: string[]): Promise<string[]> => {
  if (CONFIG.stageName === 'prod') return to

  const deliverable: string[] = []
  for (const recipient of to) {
    const address = normalizeEmail(recipient)
    const base = withoutPlusTag(address)
    if (
      isSesSimulatorAddress(address) ||
      (await isStaffAddress(address)) ||
      (base !== address && (await isStaffAddress(base)))
    ) {
      deliverable.push(recipient)
    }
  }
  return deliverable
}

export const __resetStaffAddressCache = () => staffAddresses.clear()

const tagValue = (tags: MessageTag[] | undefined, name: string) => tags?.find((tag) => tag.Name === name)?.Value

const auditBlockedRecipients = async (tags: MessageTag[] | undefined, blocked: number) => {
  const eventId = tagValue(tags, 'eventId')
  const registrationId = tagValue(tags, 'registrationId')
  if (!eventId || !registrationId) return

  await audit({
    auditKey: registrationAuditKey({ eventId, id: registrationId }),
    message: `Viesti estetty testiympäristössä (${blocked} vastaanottajaa)`,
    user: 'system',
  })
}

export async function sendTemplatedMail(
  template: EmailTemplateId,
  language: Language,
  from: string,
  to: string[],
  data: Record<string, unknown>,
  tags?: MessageTag[]
) {
  const recipients = await deliverableRecipients(to)
  const blocked = to.length - recipients.length
  if (blocked > 0) {
    logger.info('email recipients blocked outside prod', { blockedCount: blocked, template })
    await auditBlockedRecipients(tags, blocked)
  }

  if (recipients.length === 0) {
    logger.info('sendTemplatedEmail: no recipients', { template })
    return
  }
  const params: SendTemplatedEmailCommandInput = {
    ConfigurationSetName: 'Koekalenteri',
    Destination: {
      ToAddresses: recipients,
    },
    Source: from,
    Template: `${template}-${CONFIG.stackName}-${language}`,
    TemplateData: JSON.stringify(data),
  }
  if (tags) params.Tags = tags

  logger.info('sending email', { recipientCount: recipients.length, template })
  return ses.send(new SendTemplatedEmailCommand(params))
}

/**
 * Every stack attaches its bounce topic to the same account-wide configuration set, so each stack's
 * SesNotificationFunction receives every stack's bounces. The `stack` tag lets it keep only its own
 * (KOE-1468).
 */
export function registrationEmailTags(registration: JsonRegistration, template: EmailTemplateId): MessageTag[] {
  return [
    { Name: 'eventId', Value: registration.eventId },
    { Name: 'registrationId', Value: registration.id },
    { Name: 'stack', Value: CONFIG.stackName },
    { Name: 'template', Value: template },
  ]
}

export function emailTo(registration: JsonRegistration, template?: EmailTemplateId) {
  const to: string[] = []
  if (registration.handler?.email) to.push(registration.handler.email)
  for (const owner of getRegistrationOwners(registration)) {
    if (owner?.email && !to.includes(owner.email)) to.push(owner.email)
  }
  const payer = isPayerTemplate(template) ? registration.payer?.email : undefined
  if (payer && !to.includes(payer)) to.push(payer)
  return to
}

export function registrationEmailTemplateData(
  registration: JsonRegistration,
  confirmedEvent: JsonConfirmedEvent,
  origin: string | undefined,
  context: RegistrationTemplateContext,
  editToken: string,
  text: string = '',
  previousGroup?: JsonRegistrationGroup
) {
  const t = getFixedT(registration.language)

  return getRegistrationEmailTemplateData(registration, confirmedEvent, origin, context, text, t, {
    editToken,
    paymentBalance: getPaymentBalance(confirmedEvent, registration),
    previousGroup,
  })
}
