import type { ParseKeys } from 'i18next'
import type {
  AuditUserSource,
  JsonAuditDetail,
  JsonAuditRecord,
  JsonEmailDeliveryStatus,
  JsonRegistrationGroup,
} from '../types'
import { formatDate } from '../i18n/dates'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from './registration'
import { isDefined } from './typeGuards'

/**
 * Whom an audit row is attributed to. An authenticated user has no `source`; a name taken from the
 * registration's own people says so, and the trail shows the difference.
 */
export interface AuditActor {
  name: string
  source?: AuditUserSource
}

/** The `user` fields of an audit row (or a transaction) for the actor, for spreading into the record. */
export const auditUser = (actor: AuditActor): Pick<JsonAuditRecord, 'user' | 'userSource'> => ({
  user: actor.name,
  ...(actor.source ? { userSource: actor.source } : {}),
})

/**
 * What an audit row says, in two forms (KOE-1442). `messageKey` and `messageParams` are what the
 * trail translates into the reader's language; `message` is the same sentence in Finnish, stored
 * for the rows' other readers and for a client that does not know the key. The Finnish translation
 * of each key reads exactly as its `message`, so a Finnish trail looks as it did before the keys.
 *
 * A `<name>Key` parameter names a translation (a template, a reason) that the trail shows in its
 * place as `<name>`. Old rows have no key and keep their Finnish text.
 */
type AuditMessageKey = Extract<ParseKeys<'translation'>, `audit.messages.${string}`>
type AuditMessageParams = NonNullable<JsonAuditRecord['messageParams']>
export type AuditMessage = Pick<JsonAuditRecord, 'details' | 'message' | 'messageKey' | 'messageParams'>

const auditMessage = (messageKey: AuditMessageKey, message: string, messageParams?: AuditMessageParams) => ({
  message,
  messageKey,
  ...(messageParams ? { messageParams } : {}),
})

/** The lists a dog can stand on outside a day's group, by the names the participant list gives them. */
const GROUP_LIST_NAMES: Record<string, { fi: string; key: ParseKeys<'translation'> }> = {
  [GROUP_KEY_CANCELLED]: { fi: 'Peruneet', key: 'eventManagement.participantSelection.cancelled' },
  [GROUP_KEY_RESERVE]: { fi: 'Ilmoittautuneet', key: 'eventManagement.participantSelection.registered' },
}

type AuditGroup = Pick<JsonRegistrationGroup, 'date' | 'key' | 'number' | 'time'> | undefined

export const formatGroupAuditInfo = (group: AuditGroup): string => {
  if (!group) return ''

  const list = GROUP_LIST_NAMES[group.key]
  if (list) return `${list.fi} #${group.number}`

  const groupKey = [group.date && formatDate(group.date, 'eeeeee d.M.'), group.time].filter(isDefined).join(' ')

  return `${groupKey} #${group.number}`
}

/**
 * A group as parameters for the trail to name in the reader's language: a list by its translation,
 * a day group by its day (yyyy-MM-dd in Finnish time) and the translation of its time.
 */
const groupParams = (side: 'from' | 'to', group: NonNullable<AuditGroup>): AuditMessageParams => {
  const list = GROUP_LIST_NAMES[group.key]
  if (list) return { [`${side}GroupKey`]: list.key, [`${side}Number`]: group.number }

  return {
    ...(group.date ? { [`${side}Date`]: formatDate(group.date, 'yyyy-MM-dd') } : {}),
    ...(group.time ? { [`${side}TimeKey`]: `registration.time.${group.time}` } : {}),
    [`${side}Number`]: group.number,
  }
}

/** Why a registration's group changed: the secretary moved it, another move pushed it, or the automatic repair placed it. */
export type GroupChangeReason = 'automatic' | 'consequence' | 'move'

const GROUP_CHANGE_REASONS: Record<GroupChangeReason, string> = {
  automatic: '(automaattinen sijoitus)',
  consequence: 'seuraus',
  move: 'siirto',
}

export const groupChangeAudit = (previous: AuditGroup, group: AuditGroup, reason?: GroupChangeReason): AuditMessage => {
  const oldGroupInfo = previous ? `${formatGroupAuditInfo(previous)} -> ` : ''
  const reasonText = reason ? GROUP_CHANGE_REASONS[reason] : ''
  const message = `Ryhmä: ${oldGroupInfo}${formatGroupAuditInfo(group)} ${reasonText}`.trim()
  if (!group) return { message }

  const messageParams = {
    ...(previous ? groupParams('from', previous) : {}),
    ...groupParams('to', group),
    ...(reason ? { reason: reasonText, reasonKey: `audit.groupReason.${reason}` } : {}),
  }
  return auditMessage(previous ? 'audit.messages.groupChanged' : 'audit.messages.groupSet', message, messageParams)
}

export const startNumberPublishedAudit = (number: number) =>
  auditMessage('audit.messages.startNumberPublished', `Starttinumero julkaistu: ${number}`, { number })

export const startNumberReleasedAudit = (number: number) =>
  auditMessage('audit.messages.startNumberReleased', `Starttinumero vapautettu: ${number}`, { number })

/** The previous number is part of the answer: a corrected entry reads as the correction it is (KOE-1355). */
export const startNumberSavedAudit = (number: number, previous?: number) =>
  previous === undefined || previous === number
    ? auditMessage('audit.messages.startNumberSaved', `Starttinumero tallennettu: ${number}`, { number })
    : auditMessage('audit.messages.startNumberChanged', `Starttinumero tallennettu: ${previous} -> ${number}`, {
        number,
        previous,
      })

export const startNumbersPublishedAudit = (published: boolean, scope: string) => {
  const state = published ? 'julkaistu' : 'piilotettu'
  if (!scope) {
    return auditMessage(
      published ? 'audit.messages.startNumbersPublished' : 'audit.messages.startNumbersHidden',
      `Starttinumerot ${state}`
    )
  }
  return auditMessage(
    published ? 'audit.messages.startNumbersPublishedScope' : 'audit.messages.startNumbersHiddenScope',
    `Starttinumerot ${state} (${scope})`,
    { scope }
  )
}

export const startNumbersEnteredAudit = (count: number, eventClass?: string) =>
  eventClass
    ? auditMessage(
        'audit.messages.startNumbersEnteredClass',
        `Starttinumerot syötetty ${count} koiralle (${eventClass})`,
        {
          count,
          eventClass,
        }
      )
    : auditMessage('audit.messages.startNumbersEntered', `Starttinumerot syötetty ${count} koiralle`, { count })

/**
 * The translation that names a sent registration email by its subject for the context, as the email
 * itself is named (KOE-1455). Other emails go by their template, `emailTemplate.<id>`.
 */
export const emailSubjectAuditKey = (context?: string) =>
  context ? `registration.email.subject_${context}` : 'registration.email.subject'

/**
 * An email sent to a registration's people. `template` is the name the row was written with, the
 * subject in the registration's language; `templateKey` names it for the reader.
 */
export const emailSentAudit = (template: string, templateKey: string, recipients: string[]) =>
  auditMessage('audit.messages.emailSentTo', `Email: ${template}, to: ${recipients.join(', ')}`, {
    recipients: recipients.join(', '),
    template,
    templateKey,
  })

export const emailFailedAudit = (template: string, templateKey: string, recipients: string[]) =>
  auditMessage('audit.messages.emailFailedTo', `FAILED ${template}: ${recipients.join(', ')}`, {
    recipients: recipients.join(', '),
    template,
    templateKey,
  })

export const emailBlockedAudit = (count: number) =>
  auditMessage('audit.messages.emailBlocked', `Viesti estetty testiympäristössä (${count} vastaanottajaa)`, { count })

const DELIVERY_STATUS_TEXTS: Record<JsonEmailDeliveryStatus['status'], string> = {
  bounce: 'palautui',
  complaint: 'merkittiin roskapostiksi',
}

type EmailDeliveryFailure = Pick<JsonEmailDeliveryStatus, 'email' | 'reason' | 'status' | 'template'>

/** A bounce or a complaint SES reported. The template and the reason are details, shown on request. */
export const emailDeliveryFailedAudit = ({ email, reason, status, template }: EmailDeliveryFailure): AuditMessage => {
  const statusText = DELIVERY_STATUS_TEXTS[status]
  const templateText = template ? `, template: ${template}` : ''
  const reasonText = reason ? `, reason: ${reason}` : ''
  const details: JsonAuditDetail[] = [
    ...(template
      ? [
          {
            detailKey: 'audit.details.emailTemplate',
            detailParams: { template, templateKey: `emailTemplate.${template}` },
          },
        ]
      : []),
    ...(reason ? [{ detailKey: 'audit.details.deliveryReason', detailParams: { reason } }] : []),
  ]

  return {
    ...(details.length ? { details } : {}),
    ...auditMessage(
      'audit.messages.emailDeliveryFailed',
      `Sähköpostin toimitus epäonnistui (${statusText}): ${email}${templateText}${reasonText}`,
      { email, status: statusText, statusKey: `audit.deliveryStatus.${status}` }
    ),
  }
}

export const registrationCreatedAudit = () => auditMessage('audit.messages.registrationCreated', 'Ilmoittautui')

export const registrationAddedAudit = () => auditMessage('audit.messages.registrationAdded', 'Lisäsi ilmoittautumisen')

export const registrationConfirmedAudit = () =>
  auditMessage('audit.messages.registrationConfirmed', 'Ilmoittautumisen vahvistus')

/**
 * A cancellation and its reason. A predefined reason is named by its key, so the reader sees it in
 * their language; a reason the entrant wrote is shown as written.
 */
export const registrationCancelledAudit = (reasonText: string, reasonKey?: string) =>
  auditMessage('audit.messages.registrationCancelled', `Ilmoittautuminen peruttiin, syy: ${reasonText}`, {
    reason: reasonText,
    ...(reasonKey ? { reasonKey } : {}),
  })

export const registrationDaysMismatchAudit = (days: string, eventClass?: string | null) =>
  eventClass
    ? auditMessage(
        'audit.messages.registrationDaysOutsideClass',
        `Valitut päivät (${days}) eivät ole luokan ${eventClass} päiviä`,
        { days, eventClass }
      )
    : auditMessage(
        'audit.messages.registrationDaysOutsideEvent',
        `Valitut päivät (${days}) eivät ole tapahtuman päiviä`,
        {
          days,
        }
      )

export const invitationAwaitingPaymentAudit = () =>
  auditMessage('audit.messages.invitationAwaitingPayment', 'Koekutsu lähetetään, kun koepaikka on maksettu')

export const internalNotesChangedAudit = () =>
  auditMessage('audit.messages.internalNotesChanged', 'Muutti sisäistä kommenttia')

/** A money movement: the provider's name and the amount are written as the receipt shows them. */
type PaymentAuditKind = 'payment' | 'paymentFailed' | 'refund' | 'refundFailed' | 'refundPending'

const PAYMENT_AUDIT_TEXTS: Record<PaymentAuditKind, string> = {
  payment: 'Maksu',
  paymentFailed: 'Maksu epäonnistui',
  refund: 'Palautus',
  refundFailed: 'Palautus epäonnistui',
  refundPending: 'Palautus on kesken',
}

export const paymentAudit = (kind: PaymentAuditKind, provider: string, amount: string) =>
  auditMessage(`audit.messages.${kind}`, `${PAYMENT_AUDIT_TEXTS[kind]} (${provider}), ${amount}`, { amount, provider })

/** A payment that arrived for a dog already paid for: written on both registrations, each naming the other. */
export const duplicatePaymentAudit = (provider: string, amount: string, otherRegistrationId: string) =>
  auditMessage(
    'audit.messages.paymentDuplicate',
    `Päällekkäinen maksu (${provider}), ${amount}, toinen ilmoittautuminen: ${otherRegistrationId}`,
    { amount, provider, registrationId: otherRegistrationId }
  )

export const duplicatePaymentOfOtherAudit = (provider: string, amount: string, payingRegistrationId: string) =>
  auditMessage(
    'audit.messages.paymentDuplicateOther',
    `Toisen ilmoittautumisen päällekkäinen maksu (${provider}), ${amount}, maksun ilmoittautuminen: ${payingRegistrationId}`,
    { amount, provider, registrationId: payingRegistrationId }
  )

export const refundPaytrailFailedAudit = (message: string, status: number, error: string) =>
  auditMessage('audit.messages.refundPaytrailFailed', message, { error, status })

/** A result saved for the dog, with the result's own text when it has one. */
export const resultSavedAudit = (changed: boolean, result: string) => {
  const action = changed ? 'Muutti tulosta' : 'Tallensi tuloksen'
  if (!result) return auditMessage(changed ? 'audit.messages.resultChanged' : 'audit.messages.resultSaved', action)

  return auditMessage(
    changed ? 'audit.messages.resultChangedDetail' : 'audit.messages.resultSavedDetail',
    `${action}: ${result}`,
    { result }
  )
}

export const eventCopiedToAudit = (stage: string, eventId: string) =>
  auditMessage('audit.messages.eventCopiedTo', `Kopioitu ympäristöön ${stage} (${eventId})`, { eventId, stage })

export const eventCopiedFromAudit = (stage: string, eventId: string) =>
  auditMessage('audit.messages.eventCopiedFrom', `Kopioitu ympäristöstä ${stage} (${eventId})`, { eventId, stage })
