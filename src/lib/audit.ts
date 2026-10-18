import type { ParseKeys, TFunction } from 'i18next'
import type {
  AuditRecord,
  AuditUserSource,
  EmailTemplateId,
  JsonAuditChange,
  JsonAuditDetail,
  JsonAuditRecord,
  JsonEmailDeliveryStatus,
  JsonRegistration,
  JsonRegistrationGroup,
} from '../types'
import { formatDate } from '../i18n/dates'
import { dayStart, isDayKey, TIME_ZONE } from './day'
import { eventDayKey } from './event'
import {
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  isKeyRespelling,
  isPredefinedReason,
  isRegistrationClass,
} from './registration'

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

/** A row of the audit table is its auditKey and timestamp, the table's own key. */
export const auditRecordId = (record: AuditRecord) => `${record.auditKey}:${record.timestamp.toISOString()}`

/** A trail with rows added, each row once, newest first. */
export const mergeAuditTrail = (current: AuditRecord[], incoming: AuditRecord[]) => {
  const records = new Map(current.map((record) => [auditRecordId(record), record]))
  for (const record of incoming) records.set(auditRecordId(record), record)
  return [...records.values()].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

/**
 * What an audit row says: a `messageKey` and its `messageParams`, which the trail translates into the
 * reader's language (KOE-1442). A new row stores no text of its own (KOE-1511); a row written before
 * the keys keeps its Finnish `message`, and the trail shows it as it was.
 *
 * A `<name>Key` parameter names a translation (a template, a reason) that the trail shows in its
 * place as `<name>`. A raw value the reader needs as such (a reason the entrant wrote, the subject an
 * email went out with) goes under `<name>`, and stands in when the reader's bundle lacks the key.
 */
type AuditMessageKey = Extract<ParseKeys<'translation'>, `audit.messages.${string}`>
type AuditMessageParams = NonNullable<JsonAuditRecord['messageParams']>
export type AuditMessage = Pick<JsonAuditRecord, 'details' | 'messageKey' | 'messageParams'>

const auditMessage = (messageKey: AuditMessageKey, messageParams?: AuditMessageParams) => ({
  messageKey,
  ...(messageParams ? { messageParams } : {}),
})

/** The lists a dog can stand on outside a day's group, by the names the participant list gives them. */
const GROUP_LIST_KEYS: Record<string, ParseKeys<'translation'>> = {
  [GROUP_KEY_CANCELLED]: 'eventManagement.participantSelection.cancelled',
  [GROUP_KEY_RESERVE]: 'eventManagement.participantSelection.registered',
}

type AuditGroup = Pick<JsonRegistrationGroup, 'date' | 'key' | 'number' | 'time'> | undefined

/** Day parameters stand alone (`date`, `timeKey`) or for one side of a group move (`fromDate`, `toTimeKey`). */
type DayParamPrefix = '' | 'from' | 'to'
type DayParamPart = 'Date' | 'Time' | 'TimeKey'

const dayParamName = (prefix: DayParamPrefix, part: DayParamPart) =>
  prefix ? `${prefix}${part}` : `${part.charAt(0).toLowerCase()}${part.slice(1)}`

/** A day and a time as parameters: the day as yyyy-MM-dd in Finnish time, the time by its `audit.time.*` key. */
const dayParams = (prefix: DayParamPrefix, date?: string, time?: string): AuditMessageParams => ({
  ...(date ? { [dayParamName(prefix, 'Date')]: eventDayKey(date) } : {}),
  ...(time ? { [dayParamName(prefix, 'TimeKey')]: `audit.time.${time}` } : {}),
})

/** A group as parameters for the trail to name in the reader's language: a list by its key, a day group by its day and time. */
const groupParams = (side: 'from' | 'to', group: NonNullable<AuditGroup>): AuditMessageParams => {
  const listKey = GROUP_LIST_KEYS[group.key]
  if (listKey) return { [`${side}GroupKey`]: listKey, [`${side}Number`]: group.number }

  return { ...dayParams(side, group.date, group.time), [`${side}Number`]: group.number }
}

/** Why a registration's group changed: the secretary moved it, another move pushed it, or the automatic repair placed it. */
export type GroupChangeReason = 'automatic' | 'consequence' | 'move'

/** The key of a group row by the sides it names; none for a row that names no group at all. */
const groupChangeKey = (previous: AuditGroup, group: AuditGroup): AuditMessageKey | undefined => {
  if (group) return previous ? 'audit.messages.groupChanged' : 'audit.messages.groupSet'
  return previous ? 'audit.messages.groupRemoved' : undefined
}

/**
 * A group change as a row that names the group on either side; the reader names the sides by the
 * same rule. A guard: when neither side names a group, no row is written (KOE-1511). Today's callers
 * always pass one, as normalizeRegistrationGroups gives every registration a group. A group that only
 * has its key respelled (KOE-1541) is no change of place either.
 */
export const groupChangeAudit = (
  previous: AuditGroup,
  group: AuditGroup,
  reason?: GroupChangeReason
): AuditMessage | undefined => {
  const messageKey = groupChangeKey(previous, group)
  if (!messageKey || isKeyRespelling(previous, group)) return undefined

  return auditMessage(messageKey, {
    ...(previous ? groupParams('from', previous) : {}),
    ...(group ? groupParams('to', group) : {}),
    ...(reason ? { reasonKey: `audit.groupReason.${reason}` } : {}),
  })
}

export const startNumberPublishedAudit = (number: number) =>
  auditMessage('audit.messages.startNumberPublished', { number })

export const startNumberReleasedAudit = (number: number) =>
  auditMessage('audit.messages.startNumberReleased', { number })

/** The previous number is part of the answer: a corrected entry reads as the correction it is (KOE-1355). */
export const startNumberSavedAudit = (number: number, previous?: number) =>
  previous === undefined || previous === number
    ? auditMessage('audit.messages.startNumberSaved', { number })
    : auditMessage('audit.messages.startNumberChanged', { number, previous })

interface StartNumbersScope {
  /** The day, yyyy-MM-dd (KOE-1304). */
  date?: string
  eventClass?: string
  /** The half of the day (KOE-1430); only with a day. */
  time?: string
}

const startNumbersPublishedKey = (published: boolean, eventClass?: string, day?: boolean): AuditMessageKey => {
  if (eventClass && day) {
    return published ? 'audit.messages.classStartNumbersPublishedDay' : 'audit.messages.classStartNumbersHiddenDay'
  }
  if (eventClass)
    return published ? 'audit.messages.classStartNumbersPublished' : 'audit.messages.classStartNumbersHidden'
  if (day) return published ? 'audit.messages.startNumbersPublishedDay' : 'audit.messages.startNumbersHiddenDay'
  return published ? 'audit.messages.startNumbersPublished' : 'audit.messages.startNumbersHidden'
}

/**
 * Numbers published or hidden, for a class, a day or a half of one. The keys are the publishing
 * panel's, but the day reads as the group rows do ("Sat 12.9. am"), not as the panel's confirmation
 * names a half. The day and the time go as parts, for the trail to name.
 */
export const startNumbersPublishedAudit = (published: boolean, { date, eventClass, time }: StartNumbersScope = {}) => {
  const params = { ...(eventClass ? { eventClass } : {}), ...(date ? dayParams('', date, time) : {}) }

  return auditMessage(
    startNumbersPublishedKey(published, eventClass, Boolean(date)),
    Object.keys(params).length ? params : undefined
  )
}

/**
 * One day's results published or hidden, for a class or for a classless event (KOE-1510). Every
 * publish names its day, so the trail always says which day went out.
 */
export const resultsPublishedAudit = (
  published: boolean,
  { date, eventClass }: { date: string; eventClass?: string }
) => {
  if (eventClass) {
    return auditMessage(
      published ? 'audit.messages.classResultsPublishedDay' : 'audit.messages.classResultsHiddenDay',
      { eventClass, ...dayParams('', date) }
    )
  }
  return auditMessage(
    published ? 'audit.messages.resultsPublishedDay' : 'audit.messages.resultsHiddenDay',
    dayParams('', date)
  )
}

export const startNumbersEnteredAudit = (count: number, eventClass?: string) =>
  eventClass
    ? auditMessage('audit.messages.startNumbersEnteredClass', { count, eventClass })
    : auditMessage('audit.messages.startNumbersEntered', { count })

/**
 * The translation that names a sent registration email by its subject for the context, as the email
 * itself is named (KOE-1455). Other emails go by their template, `emailTemplate.<id>`.
 */
export const emailSubjectAuditKey = (context?: string) =>
  context ? `registration.email.subject_${context}` : 'registration.email.subject'

/**
 * An email sent to a registration's people, named for the reader by `templateKey`. `subject` is the
 * subject the email went out with, kept where the key names a subject the reader's bundle may lack.
 */
const emailParams = (templateKey: string, recipients: string[], subject?: string): AuditMessageParams => ({
  recipients: recipients.join(', '),
  ...(subject ? { template: subject } : {}),
  templateKey,
})

export const emailSentAudit = (templateKey: string, recipients: string[], subject?: string) =>
  auditMessage('audit.messages.emailSentTo', emailParams(templateKey, recipients, subject))

export const emailFailedAudit = (templateKey: string, recipients: string[], subject?: string) =>
  auditMessage('audit.messages.emailFailedTo', emailParams(templateKey, recipients, subject))

export const emailBlockedAudit = (count: number) => auditMessage('audit.messages.emailBlocked', { count })

type EmailDeliveryFailure = Pick<JsonEmailDeliveryStatus, 'email' | 'reason' | 'status' | 'template'>

/** A bounce or a complaint SES reported. The template and the reason are details, shown on request. */
export const emailDeliveryFailedAudit = ({ email, reason, status, template }: EmailDeliveryFailure): AuditMessage => {
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
    ...auditMessage('audit.messages.emailDeliveryFailed', { email, statusKey: `audit.deliveryStatus.${status}` }),
  }
}

export const registrationCreatedAudit = () => auditMessage('audit.messages.registrationCreated')

export const registrationAddedAudit = () => auditMessage('audit.messages.registrationAdded')

export const registrationConfirmedAudit = () => auditMessage('audit.messages.registrationConfirmed')

/** A predefined reason by its key, so the reader sees it in their language; a reason the entrant wrote as written. */
const cancelReasonParams = (cancelReason?: string): AuditMessageParams => {
  if (isPredefinedReason(cancelReason)) return { reasonKey: `registration.cancelReason.${cancelReason}` }
  if (cancelReason) return { reason: cancelReason }
  return { reasonKey: 'audit.reasonMissing' }
}

/** A cancellation and its reason, as the registration's `cancelReason` gives it; no reason says it was not given. */
export const registrationCancelledAudit = (cancelReason?: string) =>
  auditMessage('audit.messages.registrationCancelled', cancelReasonParams(cancelReason))

export const registrationDaysMismatchAudit = (days: string, eventClass?: string | null) =>
  eventClass
    ? auditMessage('audit.messages.registrationDaysOutsideClass', { days, eventClass })
    : auditMessage('audit.messages.registrationDaysOutsideEvent', { days })

export const invitationAwaitingPaymentAudit = () => auditMessage('audit.messages.invitationAwaitingPayment')

export const internalNotesChangedAudit = () => auditMessage('audit.messages.internalNotesChanged')

/** A money movement: the provider's name and the amount are written as the receipt shows them. */
type PaymentAuditKind = 'payment' | 'paymentFailed' | 'refund' | 'refundFailed' | 'refundPending'

export const paymentAudit = (kind: PaymentAuditKind, provider: string, amount: string) =>
  auditMessage(`audit.messages.${kind}`, { amount, provider })

/** A payment that arrived for a dog already paid for: written on both registrations, each naming the other. */
export const duplicatePaymentAudit = (provider: string, amount: string, otherRegistrationId: string) =>
  auditMessage('audit.messages.paymentDuplicate', { amount, provider, registrationId: otherRegistrationId })

export const duplicatePaymentOfOtherAudit = (provider: string, amount: string, payingRegistrationId: string) =>
  auditMessage('audit.messages.paymentDuplicateOther', { amount, provider, registrationId: payingRegistrationId })

/** A refund Paytrail refused: its status and its own words, or a translated "unknown error" when it gave none. */
export const refundPaytrailFailedAudit = (status: number, error?: string) =>
  auditMessage('audit.messages.refundPaytrailFailed', {
    ...(error ? { error } : { errorKey: 'audit.unknownError' }),
    status,
  })

/** A result saved for the dog, with the result's own text when it has one. */
export const resultSavedAudit = (changed: boolean, result: string) => {
  if (!result) return auditMessage(changed ? 'audit.messages.resultChanged' : 'audit.messages.resultSaved')

  return auditMessage(changed ? 'audit.messages.resultChangedDetail' : 'audit.messages.resultSavedDetail', { result })
}

/** A result sent to Kennelliitto's Omakoira (KOE-1140). */
export const resultSentToKennelliittoAudit = () => auditMessage('audit.messages.resultSentToKennelliitto')

/** A result Kennelliitto refused, with the reasons as it worded them. */
export const resultSendFailedAudit = (reason: string) => auditMessage('audit.messages.resultSendFailed', { reason })

export const resultsHandedOverAudit = () => auditMessage('audit.messages.resultsHandedOver')

export const kcGuidFoundAudit = () => auditMessage('audit.messages.kcGuidFound')

export const eventCopiedToAudit = (stage: string, eventId: string) =>
  auditMessage('audit.messages.eventCopiedTo', { eventId, stage })

export const eventCopiedFromAudit = (stage: string, eventId: string) =>
  auditMessage('audit.messages.eventCopiedFrom', { eventId, stage })

export const eventCreatedAudit = () => auditMessage('audit.messages.eventCreated')

export const eventDeletedAudit = () => auditMessage('audit.messages.eventDeleted')

export const eventSavedAudit = () => auditMessage('audit.messages.eventSaved')

/** An event edit: the trail names the changed fields from the changes themselves. */
export const eventChangedAudit = (changes: JsonAuditChange[]): { changes: JsonAuditChange[]; messageKey: string } => ({
  changes,
  messageKey: 'audit.changed',
})

/** The start list published or hidden, for the whole event or for one class. */
export const startListAudit = (published: boolean, eventClass?: string) => {
  if (eventClass) {
    return auditMessage(published ? 'audit.messages.classStartListPublished' : 'audit.messages.classStartListHidden', {
      eventClass,
    })
  }
  return auditMessage(published ? 'audit.messages.startListPublished' : 'audit.messages.startListHidden')
}

interface EmailsSent {
  failed: string[]
  ok: string[]
  registrations: Pick<JsonRegistration, 'class'>[]
  template: EmailTemplateId
}

/**
 * A template sent to a set of registrations, on the event's trail: to one class when they all stand
 * in one, the failed recipients as a detail.
 */
export const emailsSentAudit = ({ failed, ok, registrations, template }: EmailsSent): AuditMessage => {
  const classes = [...new Set(registrations.map((registration) => registration.class).filter(isRegistrationClass))]
  const eventClass = classes.length === 1 ? classes[0] : undefined

  return {
    ...(failed.length
      ? { details: [{ detailKey: 'audit.details.failedRecipients', detailParams: { recipients: failed.join('\n') } }] }
      : {}),
    ...auditMessage(eventClass ? 'audit.messages.classEmailSent' : 'audit.messages.emailSent', {
      ...(eventClass ? { eventClass } : {}),
      failed: failed.length,
      ok: ok.length,
      template,
      templateKey: `emailTemplate.${template}`,
    }),
  }
}

/*
 * Reading a row back, in the reader's language.
 */

type AuditReadParams = Record<string, unknown>

/**
 * The namespaces an audit row may name a translation from: its own messages and the email template,
 * cancellation reason and group names it reuses. A key missing from the bundle (a row written by a
 * newer backend) is not refused here; every lookup passes the stored text as `defaultValue`.
 */
const AUDIT_TRANSLATION_KEY = /^(audit|emailTemplate|eventManagement|registration)\.[\w.-]+$/

const isAuditTranslationKey = (value: unknown): value is ParseKeys<'translation'> =>
  typeof value === 'string' && AUDIT_TRANSLATION_KEY.test(value)

/**
 * A day parameter (`date`, `fromDate`, `toDate`) as a Date to format in Finnish time. `dayParams`
 * writes these as yyyy-MM-dd and that is how they arrive, from the API and over the WebSocket alike
 * (KOE-1546), so the day is read in Finnish time and a reader west of UTC-10 sees the same day.
 */
const auditDay = (value: unknown): Date | undefined => (isDayKey(value) ? dayStart(value, TIME_ZONE) : undefined)

/** Text a parameter can stand for. */
const paramText = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '')

/**
 * The parameters as a translation reads them. A `<name>Key` parameter names a translation, and its
 * text in the reader's language becomes `<name>`; the value stored under `<name>` is the fallback.
 */
const translateAuditParams = (t: TFunction, params: AuditReadParams = {}): AuditReadParams => {
  const translated: AuditReadParams = { ...params }
  for (const [name, value] of Object.entries(params)) {
    if (!name.endsWith('Key') || !isAuditTranslationKey(value)) continue
    const target = name.slice(0, -'Key'.length)
    translated[target] = t(value, { defaultValue: paramText(params[target]) })
  }
  return translated
}

/** "Sat 7.11. pm", from the day and time parameters of a side, or of the row itself. */
const dayLabel = (t: TFunction, params: AuditReadParams, prefix: DayParamPrefix) => {
  const date = auditDay(params[dayParamName(prefix, 'Date')])
  const time = params[dayParamName(prefix, 'Time')]
  return [date ? t('dateFormat.wdshort', { date }) : '', typeof time === 'string' ? time : ''].filter(Boolean).join(' ')
}

/** A group of a group move: a named list ("Registered #1") or a day and time ("Sat 7.11. pm #2"). */
const groupLabel = (t: TFunction, params: AuditReadParams, side: 'from' | 'to') => {
  const number = params[`${side}Number`]
  if (typeof number !== 'number') return ''

  const name = params[`${side}Group`]
  if (typeof name === 'string' && name) return `${name} #${number}`

  return [dayLabel(t, params, side), `#${number}`].filter(Boolean).join(' ')
}

/** A group move, a first placement or a removal: a row that names a group on either side. */
const namesGroup = (params: AuditReadParams) =>
  typeof params.toNumber === 'number' || typeof params.fromNumber === 'number'

const auditMessageParams = (t: TFunction, params?: AuditReadParams): AuditReadParams => {
  const translated = translateAuditParams(t, params)
  const day = dayLabel(t, translated, '')

  return {
    ...translated,
    ...(day ? { day } : {}),
    ...(namesGroup(translated)
      ? {
          from: groupLabel(t, translated, 'from'),
          // A move without a reason would otherwise print the literal placeholder.
          reason: translated.reason ?? '',
          to: groupLabel(t, translated, 'to'),
        }
      : {}),
  }
}

/**
 * A row's message in the reader's language. A row this reader has no key for shows the text stored
 * with it (an old row), and a new row whose key this bundle lacks says so by its key rather than
 * showing nothing (KOE-1511).
 */
export const formatAuditMessage = (
  t: TFunction,
  {
    message,
    messageKey,
    messageParams,
  }: Pick<JsonAuditRecord, 'message' | 'messageKey'> & {
    messageParams?: AuditReadParams
  }
): string => {
  // The empty default is how a key missing from this bundle shows itself.
  const text = isAuditTranslationKey(messageKey)
    ? t(messageKey, { ...auditMessageParams(t, messageParams), defaultValue: message ?? '' }).trim()
    : ''

  return text || (message ?? t('audit.unknown', { key: messageKey ?? '' }))
}

/**
 * A change label's parameters as its translation reads them. `eventDate` is an instant, the class
 * day's midnight in Finnish time (`getClassPlaceChanges`) as the ISO text it was written, and is
 * formatted as that instant.
 */
export const auditLabelParams = (params?: AuditReadParams) => {
  const eventDate = params?.eventDate
  return {
    ...params,
    ...(typeof eventDate === 'string' && eventDate ? { eventDate: formatDate(eventDate, 'd.M.yyyy') } : {}),
  }
}

/** A change's label in the reader's language, or its field when it has no label. */
export const formatAuditChangeLabel = (t: TFunction, { field, labelKey, labelParams }: JsonAuditChange): string => {
  if (!labelKey) return field

  // A label names a field from several namespaces (`event`, `registration`, `cost`, `costNames`), so
  // it is not held to the audit namespaces above. Safe as a key: one this bundle lacks reads as the
  // field through `defaultValue`.
  return t(labelKey as ParseKeys<'translation'>, { ...auditLabelParams(labelParams), defaultValue: field })
}

/**
 * A row as the trail reads it: an edit as "Changed: " and the label of each change, any other row by
 * its message.
 */
export const formatAuditRow = (
  t: TFunction,
  row: Pick<JsonAuditRecord, 'changes' | 'message' | 'messageKey'> & { messageParams?: AuditReadParams }
): string => {
  if (!row.changes?.length) return formatAuditMessage(t, row)

  return `${t('audit.changed')}: ${row.changes.map((change) => formatAuditChangeLabel(t, change)).join(', ')}`
}

export const formatAuditDetail = (t: TFunction, { detailKey, detailParams }: JsonAuditDetail) => {
  if (!isAuditTranslationKey(detailKey)) return ''

  return t(detailKey, { ...translateAuditParams(t, detailParams), defaultValue: '' })
}
